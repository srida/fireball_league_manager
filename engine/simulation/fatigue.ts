/**
 * Fatigue intra-match et blessures probabilistes (plan-développement §Phase 2
 * — Session 2). `gameStamina` est un état de simulation dérivé, comme
 * `cumulativeSeconds` en rotation.ts — jamais lu depuis `player.state` figé à
 * la génération. Seule la fitness de fin de saison précédente (season.ts)
 * initialise la valeur de départ d'un match.
 */
import { FATIGUE, INJURY, PLAYER_GENERATION } from "../config/tuning.js";
import type { RNG } from "../utils/rng.js";
import type { Event, GameState, InjurySeverity, Player, TeamSide } from "../types/index.js";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Âge dérivé au moment de la simulation (référence : date de génération de la ligue, spec-player-model §1). */
export function deriveAge(birthDate: string, referenceDate: string = PLAYER_GENERATION.referenceDate): number {
  const ref = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const birth = new Date(`${birthDate}T00:00:00Z`).getTime();
  return Math.floor((ref - birth) / MS_PER_YEAR);
}

/**
 * Décroissance (joueurs sur le terrain) et récupération (joueurs au banc) de
 * gameStamina après une possession. Mutation directe de `state.gameStamina`,
 * au même titre que `cumulativeSeconds` en rotation.ts.
 */
export function applyFatigueDrain(
  state: GameState,
  rosterBySide: Record<TeamSide, readonly Player[]>,
  clockUsed: number,
): void {
  for (const side of ["HOME", "AWAY"] as const) {
    const onCourtIds = new Set(state.onCourt[side].map((oc) => oc.player.id));
    const paceMultiplier = FATIGUE.paceDrainMultiplier[state.tactics[side].pace];
    for (const player of rosterBySide[side]) {
      const current = state.gameStamina[player.id] ?? 100;
      state.gameStamina[player.id] = onCourtIds.has(player.id)
        ? Math.max(0, current - clockUsed * FATIGUE.drainPerSecond * paceMultiplier)
        : Math.min(100, current + clockUsed * FATIGUE.recoveryPerSecond);
    }
  }
}

export interface InjuryCheckResult {
  events: Event[];
  newInjuries: Record<string, { severity: InjurySeverity; gamesOut: number }>;
}

/** Vérifie le risque de blessure de chaque joueur actuellement sur le terrain (décision produit Session 2 : à chaque possession). */
export function checkInjuries(state: GameState, rng: RNG, clock: number): InjuryCheckResult {
  const events: Event[] = [];
  const newInjuries: Record<string, { severity: InjurySeverity; gamesOut: number }> = {};

  for (const side of ["HOME", "AWAY"] as const) {
    for (const oc of state.onCourt[side]) {
      const player = oc.player;
      if (player.id in state.injuries) continue;

      const gameStamina = state.gameStamina[player.id] ?? 100;
      const fatigueMultiplier =
        gameStamina < INJURY.fatigueThreshold
          ? 1 + (INJURY.fatigueThreshold - gameStamina) * INJURY.fatigueMultiplierPerPoint
          : 1;
      const pronenessMultiplier = Math.max(
        INJURY.pronenessFloor,
        player.hidden.injuryProneness / INJURY.proneNeutral,
      );
      const age = deriveAge(player.birthDate);
      const ageMultiplier = age > INJURY.ageNeutral ? 1 + (age - INJURY.ageNeutral) * INJURY.ageMultiplierPerYear : 1;

      const probability = Math.min(
        1,
        INJURY.baseProbPerPossession * fatigueMultiplier * pronenessMultiplier * ageMultiplier,
      );

      if (!rng.bool(probability)) continue;

      const picked = rng.weightedPick(INJURY.types.map((t) => ({ item: t, weight: t.weight })));
      const gamesOut = rng.int(picked.gamesRange[0], picked.gamesRange[1]);

      events.push({ t: "INJURY", player: player.id, severity: picked.severity, clock });
      newInjuries[player.id] = { severity: picked.severity, gamesOut };
    }
  }

  return { events, newInjuries };
}
