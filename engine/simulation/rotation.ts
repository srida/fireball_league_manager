/**
 * Hiérarchie de rotation et moteur de substitutions automatique (plan-développement
 * §Phase 2 — Session 1 : "hiérarchie du roster, minutes cibles par joueur, moteur
 * de substitutions automatique respectant les consignes + gestion des 6 fautes").
 * Vérifié à chaque possession (décision produit Session 1) ; la 6e faute est
 * toujours immédiate, quelle que soit la minute du match.
 */
import { PACE, ROTATION } from "../config/tuning.js";
import { POSITIONS } from "../types/index.js";
import type {
  Event,
  GameRotationState,
  GameState,
  OnCourtPlayer,
  Player,
  Position,
  RotationPlan,
  RotationSlot,
  TeamSide,
} from "../types/index.js";

/** Note composite d'un joueur — moyenne pondérée technique/physique (spec §8, même logique que le 5 de départ P1). */
export function playerRating(p: Player): number {
  const skillAvg = Object.values(p.skills).reduce((a, b) => a + b, 0) / Object.keys(p.skills).length;
  const physicalAvg = Object.values(p.physical).reduce((a, b) => a + b, 0) / Object.keys(p.physical).length;
  return skillAvg * 0.7 + physicalAvg * 0.3;
}

/**
 * Construit la hiérarchie de rotation d'une équipe : rangs 1-5 = meilleur titulaire
 * par poste primaire (comme le 5 de départ P1), rangs suivants = meilleurs joueurs
 * restants du roster toutes positions confondues, jusqu'à `ROTATION.rotationSize`.
 */
export function buildRotationPlan(roster: readonly Player[]): RotationPlan {
  const used = new Set<string>();
  const hierarchy: RotationSlot[] = [];

  for (const position of POSITIONS) {
    const candidates = roster.filter((p) => !used.has(p.id) && p.position === position);
    const pool = candidates.length > 0 ? candidates : roster.filter((p) => !used.has(p.id));
    const best = [...pool].sort((a, b) => playerRating(b) - playerRating(a))[0];
    if (!best) continue;
    used.add(best.id);
    hierarchy.push({ playerId: best.id, position: best.position, rank: hierarchy.length + 1, targetMinutes: 0 });
  }

  const remaining = [...roster.filter((p) => !used.has(p.id))].sort((a, b) => playerRating(b) - playerRating(a));
  for (const p of remaining) {
    if (hierarchy.length >= ROTATION.rotationSize) break;
    used.add(p.id);
    hierarchy.push({ playerId: p.id, position: p.position, rank: hierarchy.length + 1, targetMinutes: 0 });
  }

  for (const slot of hierarchy) {
    slot.targetMinutes = ROTATION.targetMinutesByRank[slot.rank - 1] ?? 0;
  }

  return { hierarchy };
}

export function createGameRotationState(plan: RotationPlan): GameRotationState {
  const slotByPlayerId = new Map(plan.hierarchy.map((slot) => [slot.playerId, slot]));
  return { plan, slotByPlayerId, cumulativeSeconds: {}, benchedUntilQuarter: {}, stintStartSeconds: {} };
}

/** Temps de jeu total écoulé en secondes, réglementaire + prolongations (spec-possession §1). */
export function elapsedGameSeconds(quarter: number, clockRemaining: number): number {
  if (quarter <= 4) {
    return (quarter - 1) * PACE.quarterDurationSeconds + (PACE.quarterDurationSeconds - clockRemaining);
  }
  const regulation = 4 * PACE.quarterDurationSeconds;
  const completedOvertimes = quarter - 5;
  return (
    regulation + completedOvertimes * PACE.overtimeDurationSeconds + (PACE.overtimeDurationSeconds - clockRemaining)
  );
}

/** Q4 et prolongations : pas de mise au repos préventive, seul le foul-out s'applique. */
function isInFoulTrouble(fouls: number, quarter: number): boolean {
  const threshold = ROTATION.foulTroubleThresholdByQuarter[quarter - 1];
  if (threshold === undefined) return false;
  return fouls >= threshold;
}

function isEligible(playerId: string, state: GameState, side: TeamSide, onCourtIds: ReadonlySet<string>): boolean {
  if (onCourtIds.has(playerId)) return false;
  if (playerId in state.injuries) return false;
  if ((state.personalFouls[playerId] ?? 0) >= ROTATION.foulOutLimit) return false;
  const benchedUntil = state.rotation[side].benchedUntilQuarter[playerId];
  if (benchedUntil !== undefined && state.quarter < benchedUntil) return false;
  return true;
}

/**
 * Meilleur remplaçant disponible : même poste en priorité, sinon meilleur rang
 * restant (filet de sécurité). Simple passe linéaire sur la hiérarchie (9
 * emplacements max) — pas d'allocation de tableau intermédiaire, appelé à
 * chaque possession donc gardé volontairement bon marché.
 */
function findReplacement(
  state: GameState,
  side: TeamSide,
  position: Position,
  onCourtIds: ReadonlySet<string>,
): RotationSlot | undefined {
  let bestSamePosition: RotationSlot | undefined;
  let bestOverall: RotationSlot | undefined;
  for (const slot of state.rotation[side].plan.hierarchy) {
    if (!isEligible(slot.playerId, state, side, onCourtIds)) continue;
    if (bestOverall === undefined || slot.rank < bestOverall.rank) bestOverall = slot;
    if (slot.position === position && (bestSamePosition === undefined || slot.rank < bestSamePosition.rank)) {
      bestSamePosition = slot;
    }
  }
  return bestSamePosition ?? bestOverall;
}

export interface SubstitutionOutcome {
  events: Event[];
  onCourt: OnCourtPlayer[];
}

/**
 * Décide et applique les changements d'une équipe après une possession, par
 * ordre de priorité : blessure (toujours immédiat, plan P2 §Session 2) >
 * foul-out (6 fautes, toujours immédiat) > foul trouble (mise au repos
 * temporaire) > rythme de minutes cible (hors prolongation).
 */
export function decideSubstitutions(
  state: GameState,
  side: TeamSide,
  clock: number,
  rosterById: ReadonlyMap<string, Player>,
): SubstitutionOutcome {
  const events: Event[] = [];
  const original = state.onCourt[side];
  const rotationState = state.rotation[side];
  const elapsed = elapsedGameSeconds(state.quarter, clock);
  const regulationElapsedFraction = Math.min(1, elapsed / (4 * PACE.quarterDurationSeconds));

  let onCourt: OnCourtPlayer[] | undefined; // Cloné paresseusement, seulement si un changement a lieu.
  const onCourtIds = new Set(original.map((p) => p.player.id));

  for (const current of original) {
    const playerId = current.player.id;
    const fouls = state.personalFouls[playerId] ?? 0;

    let mustSitOut = false;
    if (playerId in state.injuries) {
      mustSitOut = true;
    } else if (fouls >= ROTATION.foulOutLimit) {
      mustSitOut = true;
    } else if (isInFoulTrouble(fouls, state.quarter) && rotationState.benchedUntilQuarter[playerId] === undefined) {
      rotationState.benchedUntilQuarter[playerId] = state.quarter + 1;
      mustSitOut = true;
    } else if (state.quarter <= 4) {
      const stintSeconds = elapsed - (rotationState.stintStartSeconds[playerId] ?? 0);
      if (stintSeconds >= ROTATION.minimumStintSeconds) {
        const slot = rotationState.slotByPlayerId.get(playerId);
        if (slot) {
          const expectedSecondsSoFar = slot.targetMinutes * 60 * regulationElapsedFraction;
          const actualSeconds = rotationState.cumulativeSeconds[playerId] ?? 0;
          mustSitOut = actualSeconds > expectedSecondsSoFar + ROTATION.paceToleranceSeconds;
        }
      }
    }

    if (!mustSitOut) continue;

    const replacementSlot = findReplacement(state, side, current.player.position, onCourtIds);
    if (!replacementSlot) continue; // Personne d'éligible : le joueur reste (filet de sécurité).

    const replacementPlayer = rosterById.get(replacementSlot.playerId);
    if (!replacementPlayer) continue;

    events.push({ t: "SUB", in: replacementPlayer.id, out: playerId, clock });
    onCourtIds.delete(playerId);
    onCourtIds.add(replacementPlayer.id);
    rotationState.stintStartSeconds[replacementPlayer.id] = elapsed;
    onCourt = (onCourt ?? [...original]).map((p) =>
      p.player.id === playerId
        ? { player: replacementPlayer, effective: { ...replacementPlayer.physical, ...replacementPlayer.skills } }
        : p,
    );
  }

  return { events, onCourt: onCourt ?? original };
}
