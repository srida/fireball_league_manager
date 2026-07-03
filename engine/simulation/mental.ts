/**
 * Pression et mental (plan-développement §Phase 2 — Session 3). Calcule le
 * contexte de pression par possession (spec-player-model.md §7), le buffer de
 * leadership, le facteur de variance de performance par match (traits
 * métronome/erratique) et l'atténuation de fatigue du trait Guerrier.
 * `pressureModifier`/`gameStaminaFactor` (constantes et formule de composure)
 * restent centralisés dans tuning.ts ; ce module ne fait que dériver le
 * contexte et les entrées de ces hooks depuis l'état de simulation vivant.
 */
import { ACTION_MODIFIERS, MENTAL, PRESSURE, gameStaminaFactor } from "../config/tuning.js";
import type { RNG } from "../utils/rng.js";
import type { GameState, Player, PlayerSkills, PressureContext } from "../types/index.js";

/** spec §7 — pressureScore = base(gameTier) + clutchTime + eliminationStake + game7. */
export function computePressureContext(state: GameState): PressureContext {
  const { gameTier, isEliminationGame, isGame7 } = state.context;
  const base = PRESSURE.baseByGameTier[gameTier];

  const marginOk = Math.abs(state.game.homeScore - state.game.awayScore) <= PRESSURE.clutchScoreMarginMax;
  const clockOk = state.quarter >= 4 && state.clockSeconds <= PRESSURE.clutchClockSecondsMax;
  const isClutchTime = marginOk && clockOk;

  const pressureScore = Math.min(
    100,
    base +
      (isClutchTime ? PRESSURE.clutchTimeBonus : 0) +
      (isEliminationGame ? PRESSURE.eliminationBonus : 0) +
      (isGame7 ? PRESSURE.game7Bonus : 0),
  );

  return { pressureScore, isClutchTime, gameTier };
}

/** Meilleur `leadership` parmi les coéquipiers (jamais le joueur lui-même — spec §7). */
export function bestTeammateLeadership(teammates: readonly { player: Player }[], selfId: string): number {
  let best = 0;
  for (const t of teammates) {
    if (t.player.id === selfId) continue;
    if (t.player.mental.leadership > best) best = t.player.mental.leadership;
  }
  return best;
}

/**
 * Force du buffer de leadership (0 à 0.5) : amortit le malus de pression subi,
 * ne l'annule jamais entièrement, et n'agit pas sur un modificateur déjà ≥ 1.
 */
export function teamLeadershipBufferStrength(bestLeadership: number, pressureScore: number): number {
  if (pressureScore <= 0) return 0;
  const delta = Math.max(0, bestLeadership - PRESSURE.leadershipNeutral);
  return Math.min(0.5, (delta * pressureScore * PRESSURE.leadershipBufferSensitivity) / 100);
}

/** Applique le buffer de leadership à un modificateur de pression déjà calculé (malus uniquement). */
export function applyLeadershipBuffer(pressureMod: number, bufferStrength: number): number {
  if (pressureMod >= 1 || bufferStrength <= 0) return pressureMod;
  return pressureMod + (1 - pressureMod) * bufferStrength;
}

/**
 * Facteur de variance de performance par match (spec §4.2 métronome/erratique),
 * tiré une fois par joueur et par match (game.ts). 1 (neutre) pour tout joueur
 * sans l'un des deux traits — ce sont des perks conditionnels, pas un bruit
 * universel appliqué à tous les joueurs.
 */
export function computeVarianceFactor(player: Player, rng: RNG): number {
  const traits = player.mental.traits;
  const stdDev = traits.includes("metronome")
    ? MENTAL.metronomeVarianceStdDev
    : traits.includes("erratic")
      ? MENTAL.erraticVarianceStdDev
      : 0;
  if (stdDev === 0) return 1;
  return Math.min(MENTAL.varianceFactorMax, Math.max(MENTAL.varianceFactorMin, rng.gaussian(1, stdDev)));
}

/** Applique le facteur de variance de match aux `skills` (le physique ne varie pas d'un match à l'autre). */
export function applyVarianceToSkills(skills: PlayerSkills, factor: number): PlayerSkills {
  if (factor === 1) return skills;
  const scaled = {} as PlayerSkills;
  for (const key of Object.keys(skills) as (keyof PlayerSkills)[]) {
    scaled[key] = Math.min(99, Math.max(0, Math.round(skills[key] * factor)));
  }
  return scaled;
}

/** Guerrier : atténue la pénalité de fatigue (blend vers 1) sans jamais dépasser gameStaminaFactor=1. */
export function effectiveGameStaminaFactor(player: Player, gameStaminaValue: number): number {
  const factor = gameStaminaFactor(gameStaminaValue);
  if (!player.mental.traits.includes("warrior")) return factor;
  return factor + (1 - factor) * MENTAL.warriorFatiguePenaltyReduction;
}

/**
 * discipline (mental) module le poids de base de la cause OFFENSIVE_FOUL du
 * turnover (remplace la constante figée de P1/Session 1-2, docs/decisions.md).
 * Exportée (comme `computePMake`, possession.ts) pour la testabilité directe.
 */
export function disciplineOffensiveFoulWeight(discipline: number): number {
  const disciplineFactor = 1 - MENTAL.disciplineOffensiveFoulWeight * (discipline - 75);
  return Math.max(ACTION_MODIFIERS.turnoverOffensiveFoulBaseWeight * disciplineFactor, 1);
}

/** Guerrier : durée d'indisponibilité réduite après blessure (season.ts). */
export function effectiveInjuryGamesOut(player: Player, gamesOut: number): number {
  if (!player.mental.traits.includes("warrior")) return gamesOut;
  return Math.max(1, Math.round(gamesOut * MENTAL.warriorInjuryRecoveryMultiplier));
}
