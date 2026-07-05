import { generateId } from "../utils/id.js";
import type { RNG } from "../utils/rng.js";
import {
  ALL_TRAITS,
  ARCHETYPE_SKILL_PROFILES,
  PLAYER_GENERATION,
  TRAIT_EXCLUSIVE_PAIRS,
  type ArchetypeSkillProfile,
} from "../config/tuning.js";
import { NAME_REGIONS } from "./names.js";
import type {
  ArchetypeId,
  GrowthCurve,
  Handedness,
  Player,
  PlayerPhysical,
  PlayerSkills,
  Position,
  Trait,
} from "../types/index.js";
import { POSITIONS } from "../types/index.js";

export const SKILL_KEYS = [
  "finishing",
  "midRange",
  "threePoint",
  "freeThrow",
  "ballHandling",
  "passing",
  "courtVision",
  "postPlay",
  "onBallDefense",
  "offBallDefense",
  "block",
  "steal",
  "offRebound",
  "defRebound",
  "defensiveIQ",
] as const satisfies readonly (keyof PlayerSkills)[];

export const PHYSICAL_KEYS = [
  "speed",
  "vertical",
  "strength",
  "lateralQuickness",
  "stamina",
] as const satisfies readonly (keyof PlayerPhysical)[];

const GROWTH_CURVES: readonly GrowthCurve[] = ["early", "standard", "late"];

/** Tirage gaussien borné, centré sur le milieu de la fourchette. */
function sampleRange(rng: RNG, range: { min: number; max: number }): number {
  const mean = (range.min + range.max) / 2;
  const stdDev = (range.max - range.min) / 4;
  return Math.round(rng.gaussian(mean, stdDev, range.min, range.max));
}

function sampleSkill(rng: RNG, profile: ArchetypeSkillProfile, offArchetype: boolean, key: (typeof SKILL_KEYS)[number]): number {
  const tiers = PLAYER_GENERATION.attributeTiers;
  if (offArchetype) {
    return sampleRange(rng, tiers.offArchetype);
  }
  if (profile.uniform) {
    return Math.round(rng.gaussian(75, 6, tiers.uniformWing.min, tiers.uniformWing.hardCap));
  }
  if (profile.strong.includes(key)) return sampleRange(rng, tiers.strong);
  if (profile.medium.includes(key)) return sampleRange(rng, tiers.medium);
  if (profile.weak.includes(key)) return sampleRange(rng, tiers.weak);
  return sampleRange(rng, tiers.average);
}

function generateSkills(rng: RNG, archetypeId: ArchetypeId, offArchetype: boolean): PlayerSkills {
  const profile = ARCHETYPE_SKILL_PROFILES[archetypeId];
  const skills = {} as PlayerSkills;
  for (const key of SKILL_KEYS) {
    skills[key] = sampleSkill(rng, profile, offArchetype, key);
  }
  return skills;
}

function generatePhysical(rng: RNG, position: Position): PlayerPhysical {
  const ranges = PLAYER_GENERATION.physicalRangeByPosition[position];
  const physical = {} as PlayerPhysical;
  for (const key of PHYSICAL_KEYS) {
    const [min, max] = ranges[key];
    physical[key] = sampleRange(rng, { min, max });
  }
  return physical;
}

/** Mental tiré indépendamment de la qualité technique (spec-player-model.md §8). */
function generateMentalAttributes(rng: RNG) {
  const range = PLAYER_GENERATION.mentalRange;
  return {
    leadership: sampleRange(rng, range),
    composure: sampleRange(rng, range),
    competitiveness: sampleRange(rng, range),
    discipline: sampleRange(rng, range),
    coachability: sampleRange(rng, range),
    workEthic: sampleRange(rng, range),
    ego: sampleRange(rng, range),
  };
}

function generateTraits(rng: RNG): Trait[] {
  const count = rng.int(PLAYER_GENERATION.mentalTraits.min, PLAYER_GENERATION.mentalTraits.max);
  const excluded = new Set<Trait>();
  const chosen: Trait[] = [];
  const pool = [...ALL_TRAITS];
  while (chosen.length < count && pool.length > 0) {
    const candidates = pool.filter((t) => !excluded.has(t) && !chosen.includes(t));
    if (candidates.length === 0) break;
    const trait = rng.pick(candidates);
    chosen.push(trait);
    for (const [a, b] of TRAIT_EXCLUSIVE_PAIRS) {
      if (trait === a) excluded.add(b);
      if (trait === b) excluded.add(a);
    }
  }
  return chosen;
}

function generateHidden(rng: RNG) {
  const h = PLAYER_GENERATION.hidden;
  return {
    potential: Math.round(rng.gaussian(h.potential.mean, h.potential.stdDev, 0, 99)),
    growthCurve: rng.pick(GROWTH_CURVES),
    injuryProneness: Math.round(rng.gaussian(h.injuryProneness.mean, h.injuryProneness.stdDev, 0, 99)),
    trueComposure: Math.round(rng.gaussian(h.trueComposure.mean, h.trueComposure.stdDev, 0, 99)),
    peakAge: rng.int(h.peakAge.min, h.peakAge.max),
    declineRate: Math.round(rng.gaussian(h.declineRate.mean, h.declineRate.stdDev, 0, 99)),
  };
}

/** Dérive une birthDate ISO à partir d'un âge tiré et de la date de référence de génération. */
function generateBirthDate(rng: RNG): string {
  const age = rng.int(PLAYER_GENERATION.ageRange.min, PLAYER_GENERATION.ageRange.max);
  const reference = new Date(PLAYER_GENERATION.referenceDate + "T00:00:00Z");
  const birthYear = reference.getUTCFullYear() - age;
  const month = rng.int(0, 11);
  const day = rng.int(1, 28); // borne basse pour rester valide sur tous les mois
  return new Date(Date.UTC(birthYear, month, day)).toISOString().slice(0, 10);
}

function generateSecondaryPositions(rng: RNG, primary: Position): Position[] {
  const count = rng.int(PLAYER_GENERATION.secondaryPositions.min, PLAYER_GENERATION.secondaryPositions.max);
  const others = POSITIONS.filter((p) => p !== primary);
  const shuffled: Position[] = [];
  const pool = [...others];
  while (shuffled.length < count && pool.length > 0) {
    const idx = rng.int(0, pool.length - 1);
    shuffled.push(pool.splice(idx, 1)[0] as Position);
  }
  return shuffled;
}

export function generatePlayer(rng: RNG, archetypeId: ArchetypeId, position: Position): Player {
  const offArchetype = rng.bool(PLAYER_GENERATION.offArchetypeRate);
  const profile = ARCHETYPE_SKILL_PROFILES[archetypeId];

  const heightRange = PLAYER_GENERATION.heightRangeByPosition[position];
  const heightCm = sampleRange(rng, heightRange);

  const wingspanRange =
    profile.wingspanBias === "high"
      ? { min: (PLAYER_GENERATION.wingspanBonusCm.min + PLAYER_GENERATION.wingspanBonusCm.max) / 2, max: PLAYER_GENERATION.wingspanBonusCm.max }
      : PLAYER_GENERATION.wingspanBonusCm;
  const wingspanBonus = sampleRange(rng, wingspanRange);
  const wingspanCm = heightCm + wingspanBonus;

  const bmi = rng.float(PLAYER_GENERATION.bmi.min, PLAYER_GENERATION.bmi.max);
  const weightKg = Math.round(bmi * (heightCm / 100) ** 2);

  const handedness: Handedness = rng.bool(PLAYER_GENERATION.leftHandedRate) ? "left" : "right";

  // Une seule région tirée pour prénom + nom + origine : le nom du joueur
  // doit rester cohérent avec sa ville d'origine (spec-player-model.md §1).
  const region = rng.pick(NAME_REGIONS);

  const player: Player = {
    id: generateId(rng),
    firstName: rng.pick(region.firstNames),
    lastName: rng.pick(region.lastNames),
    birthDate: generateBirthDate(rng),
    heightCm,
    weightKg,
    wingspanCm,
    position,
    secondaryPositions: generateSecondaryPositions(rng, position),
    handedness,
    jerseyNumber: 0, // assigné par assignJerseyNumbers() au niveau du roster (unicité par équipe)
    origin: rng.pick(region.origins),
    physical: generatePhysical(rng, position),
    skills: generateSkills(rng, archetypeId, offArchetype),
    mental: {
      ...generateMentalAttributes(rng),
      traits: generateTraits(rng),
    },
    hidden: generateHidden(rng),
    state: {
      morale: 70,
      fitness: 100,
      gameStamina: 100,
      injury: { type: null, remainingGames: 0 },
      form: 0,
      // Bootstrap générique (0) — `generateRoster` (ligue initiale) et `draftClass.ts`/
      // `offseason.ts` (rookies) réécrivent cette valeur selon leur contexte.
      seasonsInLeague: 0,
    },
    generation: { archetypeId, offArchetype },
  };

  return player;
}
