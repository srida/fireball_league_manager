/**
 * Assignation du profil tactique d'une équipe depuis la composition de son
 * roster (plan-développement §Phase 2 — Session 1 : "IA tactique basique des
 * 29 autres équipes, profil choisi selon la composition de leur roster").
 * Utilisé une fois à la génération de la ligue (spec plan P2 : tactiques fixes
 * pour la saison, pas de recalcul dynamique en Session 1).
 */
import { TACTIC_ASSIGNMENT } from "../config/tuning.js";
import type { DefensiveAggressiveness, OffensiveOrientation, Pace, Player, TeamTactics } from "../types/index.js";
import type { RNG } from "../utils/rng.js";

function avg(players: readonly Player[], select: (p: Player) => number): number {
  if (players.length === 0) return 0;
  return players.reduce((sum, p) => sum + select(p), 0) / players.length;
}

function offensiveOrientationFromRoster(roster: readonly Player[]): OffensiveOrientation {
  const threePointAvg = avg(roster, (p) => p.skills.threePoint);
  const bigs = roster.filter((p) => p.position === "PF" || p.position === "C");
  // `postPlay` seul (pas `strength`, physique et élevé chez tous les intérieurs
  // indépendamment de l'identité offensive du roster — voir tuning.ts).
  const insideAvg = avg(bigs.length > 0 ? bigs : roster, (p) => p.skills.postPlay);
  const diff = threePointAvg - insideAvg;

  if (diff >= TACTIC_ASSIGNMENT.offensiveOrientationMargin) return "THREE_POINT";
  if (-diff >= TACTIC_ASSIGNMENT.offensiveOrientationMargin) return "INSIDE";
  return "BALANCED";
}

function defensiveAggressivenessFromRoster(roster: readonly Player[]): DefensiveAggressiveness {
  const defenseAvg = avg(roster, (p) => (p.skills.onBallDefense + p.skills.steal) / 2);
  if (defenseAvg >= TACTIC_ASSIGNMENT.aggressiveDefenseThreshold) return "HIGH";
  if (defenseAvg <= TACTIC_ASSIGNMENT.passiveDefenseThreshold) return "LOW";
  return "NORMAL";
}

function paceFromRoster(roster: readonly Player[]): Pace {
  const speedAvg = avg(roster, (p) => p.physical.speed);
  if (speedAvg >= TACTIC_ASSIGNMENT.fastPaceThreshold) return "FAST";
  if (speedAvg <= TACTIC_ASSIGNMENT.slowPaceThreshold) return "SLOW";
  return "NORMAL";
}

const PACES: readonly Pace[] = ["SLOW", "NORMAL", "FAST"];
const ORIENTATIONS: readonly OffensiveOrientation[] = ["THREE_POINT", "BALANCED", "INSIDE"];
const AGGRESSIVENESS: readonly DefensiveAggressiveness[] = ["LOW", "NORMAL", "HIGH"];

/**
 * Assigne un profil tactique depuis la composition du roster, avec un tirage
 * "hors-profil" (miroir de l'offArchetype des joueurs, spec §8) pour éviter
 * que des rosters proches convergent systématiquement vers le même profil.
 */
export function assignTacticsFromRoster(rng: RNG, roster: readonly Player[]): TeamTactics {
  if (rng.bool(TACTIC_ASSIGNMENT.offProfileRate)) {
    const staminaAvg = avg(roster, (p) => p.physical.stamina);
    const defensiveAggressiveness = rng.pick(AGGRESSIVENESS);
    return {
      pace: rng.pick(PACES),
      offensiveOrientation: rng.pick(ORIENTATIONS),
      defensiveAggressiveness,
      pressing: defensiveAggressiveness !== "LOW" && staminaAvg >= TACTIC_ASSIGNMENT.pressingStaminaThreshold,
    };
  }

  const defensiveAggressiveness = defensiveAggressivenessFromRoster(roster);
  const staminaAvg = avg(roster, (p) => p.physical.stamina);

  return {
    pace: paceFromRoster(roster),
    offensiveOrientation: offensiveOrientationFromRoster(roster),
    defensiveAggressiveness,
    pressing: defensiveAggressiveness !== "LOW" && staminaAvg >= TACTIC_ASSIGNMENT.pressingStaminaThreshold,
  };
}
