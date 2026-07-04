/**
 * Courbes de carrière (plan-développement §Phase 3 — Session 1, spec-player-model.md
 * §5 : `potential`, `growthCurve`, `peakAge`, `declineRate`). Progression/déclin
 * annuel appliqué à l'intersaison (`engine/season/offseason.ts`), jamais pendant
 * un match — le moteur de possession reste inchangé, le golden master (seed
 * unique, une saison) n'est donc pas affecté par cette session.
 *
 * `hidden.potential` est un plafond global unique (spec §5 : "plafond de
 * progression global"), pas une valeur par attribut : chaque attribut (technique
 * ou physique) progresse vers ce même plafond, jamais au-delà.
 */
import { DEVELOPMENT } from "../config/tuning.js";
import { PHYSICAL_KEYS, SKILL_KEYS } from "../generation/player.js";
import type { RNG } from "../utils/rng.js";
import type { Player } from "../types/index.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Multiplicateur centré sur `DEVELOPMENT.mentalNeutral`, ex. workEthic/coachability élevés accélèrent la progression. */
function mentalFactor(value: number, weight: number): number {
  return 1 + ((value - DEVELOPMENT.mentalNeutral) / DEVELOPMENT.mentalNeutral) * weight;
}

/** Pic effectif de carrière : `peakAge` décalé selon le profil `growthCurve` (précoce/standard/tardif). */
export function effectivePeakAge(player: Player): number {
  return player.hidden.peakAge + DEVELOPMENT.growthCurveOffsetYears[player.hidden.growthCurve];
}

/** Le physique pique (et donc décline) avant le technique — spec plan P3 §Session 1. */
export function physicalPeakAge(player: Player): number {
  return effectivePeakAge(player) - DEVELOPMENT.physicalPeakLeadYears;
}

export function technicalPeakAge(player: Player): number {
  return effectivePeakAge(player) + DEVELOPMENT.technicalPeakLagYears;
}

function ageProgressFactor(age: number, peakAge: number): number {
  const yearsToPeak = peakAge - age;
  return clamp(yearsToPeak / DEVELOPMENT.progression.ageFactorSpanYears, DEVELOPMENT.progression.ageFactorFloor, 1);
}

function growAttribute(
  current: number,
  ceiling: number,
  ageFactor: number,
  workEthic: number,
  coachability: number,
  minutesShare: number,
  flatBonus: number,
): number {
  const gap = Math.max(0, ceiling - current);
  const potentialFactor = clamp(gap / DEVELOPMENT.progression.potentialGapDivisor, 0, 1);
  const workEthicFactor = mentalFactor(workEthic, DEVELOPMENT.progression.workEthicWeight);
  const coachabilityFactor = mentalFactor(coachability, DEVELOPMENT.progression.coachabilityWeight);
  const minutesFactor = clamp(minutesShare, DEVELOPMENT.progression.minutesFloor, 1);
  const gain =
    DEVELOPMENT.progression.maxAnnualGain * potentialFactor * ageFactor * workEthicFactor * coachabilityFactor * minutesFactor +
    flatBonus;
  // `potential` est un plafond global (spec §5) : jamais dépassé par la croissance
  // organique, y compris le bonus flat de micro-progression. Un joueur déjà généré
  // au-dessus de son `potential` (archétype fort, tirage haut) n'est pas rabaissé
  // pour autant — `effectiveCeiling` ne fait que bloquer une progression future.
  const effectiveCeiling = Math.max(ceiling, current);
  return clamp(current + gain, 0, Math.min(99, effectiveCeiling));
}

function declineAttribute(current: number, age: number, peakAge: number, declineRate: number, workEthic: number, baseAnnualLoss: number): number {
  const yearsPast = Math.max(0, age - peakAge);
  if (yearsPast === 0) return current;
  const d = DEVELOPMENT.decline;
  const declineRateFactor = d.declineRateFactorBase + declineRate * d.declineRateFactorWeight;
  const yearsPastFactor = 1 + yearsPast * d.accelerationPerYear;
  const mitigationFactor = clamp(
    1 - (workEthic - DEVELOPMENT.mentalNeutral) / d.workEthicMitigationDivisor,
    d.mitigationFloor,
    d.mitigationCeil,
  );
  const loss = baseAnnualLoss * declineRateFactor * yearsPastFactor * mitigationFactor;
  return clamp(current - loss, 0, 99);
}

/**
 * Applique une année de progression/déclin à `player` (mutation directe,
 * même convention que `gameDriver`/`season.ts` pour l'état persistant
 * inter-saisons). `age` et `minutesShare` (0-1, part de `DEVELOPMENT.referenceSeasonMinutes`
 * jouée dans la saison écoulée) sont calculés par l'appelant (`offseason.ts`).
 */
export function applyAnnualDevelopment(player: Player, age: number, minutesShare: number): void {
  const physPeak = physicalPeakAge(player);
  const techPeak = technicalPeakAge(player);
  const { workEthic, coachability } = player.mental;
  const ceiling = player.hidden.potential;
  const declineRate = player.hidden.declineRate;

  const microBonus =
    age <= DEVELOPMENT.microProgression.maxAge && minutesShare >= DEVELOPMENT.microProgression.minMinutesShare
      ? DEVELOPMENT.microProgression.flatBonus
      : 0;

  for (const key of SKILL_KEYS) {
    const current = player.skills[key];
    player.skills[key] =
      age < techPeak
        ? growAttribute(current, ceiling, ageProgressFactor(age, techPeak), workEthic, coachability, minutesShare, microBonus)
        : declineAttribute(current, age, techPeak, declineRate, workEthic, DEVELOPMENT.decline.technicalBaseAnnualLoss);
  }

  for (const key of PHYSICAL_KEYS) {
    const current = player.physical[key];
    player.physical[key] =
      age < physPeak
        ? growAttribute(current, ceiling, ageProgressFactor(age, physPeak), workEthic, coachability, minutesShare, 0)
        : declineAttribute(current, age, physPeak, declineRate, workEthic, DEVELOPMENT.decline.physicalBaseAnnualLoss);
  }
}

/** Note globale simple (même convention que `batch/metrics.ts` `teamOverallRating`), utilisée pour la retraite. */
export function playerOverallRating(player: Player): number {
  const skillAvg = Object.values(player.skills).reduce((a, b) => a + b, 0) / SKILL_KEYS.length;
  const physicalAvg = Object.values(player.physical).reduce((a, b) => a + b, 0) / PHYSICAL_KEYS.length;
  return skillAvg * 0.7 + physicalAvg * 0.3;
}

export function retirementProbability(player: Player, age: number): number {
  const r = DEVELOPMENT.retirement;
  if (age >= r.hardRetireAge) return 1;
  let prob = 0;
  if (age > r.baseAgeThreshold) prob += (age - r.baseAgeThreshold) * r.probPerYearOverThreshold;
  if (age >= r.lowRatingAgeThreshold && playerOverallRating(player) < r.lowRatingThreshold) prob += r.lowRatingProb;
  return clamp(prob, 0, 0.95);
}

/** Tirage de retraite (spec plan P3 §Session 1 : "probabilité croissante selon âge + niveau restant"). */
export function rollRetirement(rng: RNG, player: Player, age: number): boolean {
  return rng.bool(retirementProbability(player, age));
}
