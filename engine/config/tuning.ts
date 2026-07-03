import type { ArchetypeId, Position, PlayerSkills, Trait } from "../types/index.js";

type SkillKey = keyof PlayerSkills;

/**
 * Toutes les constantes marquées ⚙ dans les specs, centralisées ici
 * (CLAUDE.md — "Toutes les probabilités et constantes d'équilibrage sont
 * centralisées dans /engine/config/tuning.ts, jamais de magic numbers dans
 * la logique").
 *
 * Deux catégories de valeurs :
 * - Valeurs **spécifiées** : reprises telles quelles depuis les specs (ex. FG% au cercle ~62 %).
 * - Valeurs **initiales non spécifiées** (marquées "valeur initiale — à calibrer") :
 *   la spec pose la formule mais pas le chiffre (ex. poids w1/w2/w3 de l'usage).
 *   Ce sont les curseurs que `batch/calibrate` (spec-possession §11) fera varier
 *   un par un pour matcher les cibles ligue.
 */

// ---------------------------------------------------------------------------
// §1 — Rythme de match (spec-possession-algorithm.md)
// ---------------------------------------------------------------------------
export const PACE = {
  /** ⚙ Possessions par équipe et par match, base P1. */
  basePossessionsPerTeam: 99,
  /** Durée d'un quart-temps régulier, en secondes (12 min). */
  quarterDurationSeconds: 12 * 60,
  /** Durée d'une prolongation, en secondes (5 min). */
  overtimeDurationSeconds: 5 * 60,
  /** Horloge des tirs, en secondes. */
  shotClockSeconds: 24,
  /** Horloge des tirs après rebond offensif (spec §7). */
  shotClockAfterOffensiveReboundSeconds: 14,
} as const;

// ---------------------------------------------------------------------------
// §3 — Sélection du porteur / usage (spec-possession-algorithm.md)
// ---------------------------------------------------------------------------
export const USAGE = {
  // usageWeight(p) = w1·ballHandling + w2·courtVision + w3·moyenne(finishing, midRange, threePoint)
  //                × positionFactor(p) × gameStaminaFactor(p)
  /** ⚙ valeur initiale — à calibrer. */
  w1BallHandling: 0.4,
  /** ⚙ valeur initiale — à calibrer. */
  w2CourtVision: 0.3,
  /** ⚙ valeur initiale — à calibrer. */
  w3ScoringAverage: 0.3,
  /** ⚙ positionFactor(p) : PG > SG > SF > PF > C en P1 — valeurs initiales, à calibrer. */
  positionFactor: {
    PG: 1.3,
    SG: 1.15,
    SF: 1.0,
    PF: 0.85,
    C: 0.7,
  } satisfies Record<Position, number>,
} as const;

// ---------------------------------------------------------------------------
// §4 — Choix d'action du porteur (spec-possession-algorithm.md)
// ---------------------------------------------------------------------------
export const ACTION_PROBABILITY = {
  /** ⚙ Probabilités de base avant modificateurs. Somme = 1. */
  base: {
    shot: 0.38,
    pass: 0.45,
    turnover: 0.09,
    foulDrawn: 0.08,
  },
  /** ⚙ Nombre maximum de passes par possession avant résolution forcée. */
  maxPassesPerPossession: 4,
  /** ⚙ En dessous de cette horloge (s), le tir est de plus en plus forcé (100 % à 0 s). */
  shotForcedBelowClockSeconds: 6,
} as const;

// ---------------------------------------------------------------------------
// §5 — Sélection du type de tir (spec-possession-algorithm.md)
// ---------------------------------------------------------------------------
export const SHOT_SELECTION = {
  // p(shotType) ∝ baseX × f(attribut du tireur), f convexe.
  // Bases calibrées pour ~40 % de tirs à 3pts au niveau ligue (spec §5, §11).
  /** ⚙ valeur initiale — à calibrer pour ~38-42 % de tirs à 3pts. */
  baseThree: 0.34,
  /** ⚙ valeur initiale — à calibrer. */
  baseMidRange: 0.28,
  /** ⚙ valeur initiale — à calibrer. */
  baseRim: 0.38,
  /**
   * ⚙ Exposant de convexité de f() : f(attr) = (attr/99)^convexityExponent.
   * > 1 ⇒ un attribut de 90 tire beaucoup plus qu'un 70 (convexe, spec §5).
   * Valeur initiale — à calibrer.
   */
  convexityExponent: 1.8,
} as const;

// ---------------------------------------------------------------------------
// §6 — Résolution du tir (spec-possession-algorithm.md)
// ---------------------------------------------------------------------------
export const SHOT_SUCCESS = {
  /** ⚙ baseFG(shotType) — spec §6.1. */
  baseFG: {
    RIM: 0.62,
    MID_RANGE: 0.42,
    THREE: 0.36,
  },
  /** ⚙ k — attackFactor = 1 + k·(shooterAttr − 75)/100. Valeur initiale — à calibrer. */
  attackFactorK: 0.35,
  /** ⚙ d — defenseFactor = 1 − d·(defAttr − 75)/100. Valeur initiale — à calibrer. */
  defenseFactorD: 0.3,
  /** ⚙ Bonus à domicile appliqué à pMake. */
  homeFactorBonus: 0.015,
  /** ⚙ Bornes finales de pMake. */
  pMakeMin: 0.05,
  pMakeMax: 0.85,
  /**
   * ⚙ Multiplicateurs de pMake selon le niveau de contest (spec §6.1 "contestFactor").
   * Valeurs initiales — à calibrer.
   */
  contestFactor: {
    OPEN: 1.15,
    CONTESTED: 1.0,
    HEAVILY_CONTESTED: 0.75,
  },
} as const;

export const BLOCK = {
  /** ⚙ Probabilité de base de contre au cercle (spec §6.2). */
  pBlockRim: 0.08,
  /** ⚙ Probabilité de base de contre ailleurs (spec §6.2). */
  pBlockElsewhere: 0.02,
} as const;

export const AND_ONE = {
  /** ⚙ Fourchette de pAndOne, modulée par shotType/strength (spec §6.2). */
  min: 0.02,
  max: 0.04,
} as const;

export const FREE_THROW = {
  /**
   * ⚙ Malus de % de réussite (points de %, ex. 0.03 = -3pts) si pressureScore
   * élevé et composure faible. P2 — non appliqué en P1 (pressureScore inactif).
   */
  pressurePenalty: 0.03,
} as const;

// ---------------------------------------------------------------------------
// §7 — Rebond (spec-possession-algorithm.md)
// ---------------------------------------------------------------------------
export const REBOUND = {
  /**
   * ⚙ B — pOffensiveRebound = Σpoids_off / (Σpoids_off + B·Σpoids_def).
   * Calibré pour ~26-28 % de rebonds offensifs au niveau ligue. Valeur initiale — à calibrer.
   */
  defensiveWeightMultiplierB: 1.35,
  /**
   * ⚙ Coefficients de g(heightCm, wingspanCm, vertical, strength) — poids physique
   * du rebond, appliqué en multiplicateur de reboundWeight. Valeurs initiales — à calibrer.
   */
  physicalWeightCoefficients: {
    heightCm: 0.5,
    wingspanCm: 0.3,
    vertical: 0.12,
    strength: 0.08,
  },
} as const;

// ---------------------------------------------------------------------------
// §8 — Consommation d'horloge (spec-possession-algorithm.md)
// ---------------------------------------------------------------------------
export const CLOCK_CONSUMPTION = {
  /** ⚙ Mise en place, en secondes. */
  setup: { min: 4, max: 8 },
  /** ⚙ Par passe, en secondes. */
  perPass: { min: 2, max: 5 },
  /** ⚙ Création du tir, en secondes. */
  shotCreation: { min: 2, max: 6 },
} as const;

// ---------------------------------------------------------------------------
// Hooks prévus par les specs — actifs à partir de P2, renvoient 1 en P1
// (CLAUDE.md — scope P1 : "Les hooks... existent mais renvoient 1.")
// ---------------------------------------------------------------------------

/** Modificateur de pression (spec-player-model.md §7). P2. Identité en P1. */
export function pressureModifier(
  _trueComposure: number,
  _traits: readonly Trait[],
  _pressureScore: number,
): number {
  return 1;
}

/** Facteur de stamina intra-match (spec-possession-algorithm.md §3). P2. Identité en P1. */
export function gameStaminaFactor(_gameStamina: number): number {
  return 1;
}

// ---------------------------------------------------------------------------
// Calibration ligue — cibles de validation (spec-possession-algorithm.md §11)
// Utilisées par batch/calibrate, pas par le moteur lui-même.
// ---------------------------------------------------------------------------
export const LEAGUE_TARGETS = {
  pointsPerTeamPerGame: { min: 110, max: 120 },
  fgPercent: { min: 0.46, max: 0.48 },
  threePointAttemptShare: { min: 0.38, max: 0.42 },
  threePointPercent: { min: 0.35, max: 0.37 },
  turnoversPerTeamPerGame: { min: 12, max: 15 },
  offensiveReboundShare: { min: 0.26, max: 0.28 },
  homeWinPercent: { min: 0.55, max: 0.6 },
  topScorerPpg: { min: 28, max: 33 },
  winsSpreadBestVsWorst: { best: 60, worst: 15 },
  calibrationSeasons: 50,
} as const;

// ---------------------------------------------------------------------------
// Génération procédurale — ligue (spec-player-model.md, CLAUDE.md structure)
// ---------------------------------------------------------------------------
export const LEAGUE_GENERATION = {
  teamCount: 30,
  conferenceCount: 2,
  divisionsPerConference: 3,
  teamsPerDivision: 5,
  rosterSize: 15,
  /** Répartition simplifiée P1 : 3 joueurs par poste primaire = 15. */
  playersPerPositionOnRoster: 3,
} as const;

// ---------------------------------------------------------------------------
// Génération procédurale — joueurs (spec-player-model.md §1, §8)
// ---------------------------------------------------------------------------
export const PLAYER_GENERATION = {
  heightCm: { min: 175, max: 225 },
  /** wingspanCm = heightCm + [0, 15] (spec §1). */
  wingspanBonusCm: { min: 0, max: 15 },
  /** IMC plausible pour un athlète de basket professionnel. */
  bmi: { min: 21, max: 27 },
  /** ~10 % de gauchers (spec §1). */
  leftHandedRate: 0.1,
  jerseyNumber: { min: 0, max: 99 },
  ageRange: { min: 19, max: 38 },
  /**
   * Date de référence utilisée pour dériver `birthDate` à partir de l'âge tiré.
   * Placeholder tant que le calendrier de saison (session suivante) ne fournit
   * pas de date in-game réelle. Volontairement fixe (jamais `Date.now()`) pour
   * ne pas casser la reproductibilité seed → même résultat.
   */
  referenceDate: "2026-10-01",
  /** Attributs mentaux tirés indépendamment de la qualité technique (spec §8). */
  mentalRange: { min: 20, max: 95 },
  hidden: {
    potential: { mean: 60, stdDev: 20 },
    injuryProneness: { mean: 30, stdDev: 15 },
    trueComposure: { mean: 55, stdDev: 20 },
    peakAge: { min: 25, max: 31 },
    declineRate: { mean: 50, stdDev: 15 },
  },
  /** ⚙ Tirage "hors-archétype" (spec §8). */
  offArchetypeRate: 0.1,
  secondaryPositions: { min: 0, max: 2 },
  mentalTraits: { min: 0, max: 3 },

  /** Fourchettes de génération par palier d'attribut (spec §8, tableau archétypes). */
  attributeTiers: {
    strong: { min: 75, max: 95 },
    medium: { min: 55, max: 75 },
    weak: { min: 25, max: 55 },
    /** Palier neutre utilisé pour les attributs non listés dans l'archétype. */
    average: { min: 40, max: 70 },
    /** Ailier tout-terrain (spec §8) : "polyvalence 65-85 partout, rarement > 88". */
    uniformWing: { min: 65, max: 85, hardCap: 88 },
    /** Tirage hors-archétype (~10 %, spec §8) : profil atypique, pleine plage. */
    offArchetype: { min: 25, max: 95 },
  },

  /**
   * Fourchettes de taille par poste primaire, en cm — valeurs initiales
   * cohérentes avec heightCm [175, 225], à calibrer via batch.
   */
  heightRangeByPosition: {
    PG: { min: 180, max: 196 },
    SG: { min: 190, max: 203 },
    SF: { min: 198, max: 208 },
    PF: { min: 205, max: 216 },
    C: { min: 210, max: 225 },
  } satisfies Record<Position, { min: number; max: number }>,

  /**
   * Fourchettes physiques par poste primaire (spec §2, non couvert par le
   * tableau d'archétypes qui ne porte que sur `skills`). Valeurs initiales — à calibrer.
   */
  physicalRangeByPosition: {
    PG: { speed: [75, 95], vertical: [55, 80], strength: [40, 65], lateralQuickness: [75, 95], stamina: [60, 85] },
    SG: { speed: [70, 92], vertical: [60, 85], strength: [45, 68], lateralQuickness: [70, 90], stamina: [60, 85] },
    SF: { speed: [62, 85], vertical: [60, 85], strength: [55, 75], lateralQuickness: [62, 85], stamina: [60, 85] },
    PF: { speed: [45, 70], vertical: [55, 80], strength: [65, 90], lateralQuickness: [45, 68], stamina: [55, 80] },
    C: { speed: [35, 60], vertical: [50, 78], strength: [70, 95], lateralQuickness: [35, 58], stamina: [55, 80] },
  } satisfies Record<Position, Record<"speed" | "vertical" | "strength" | "lateralQuickness" | "stamina", readonly [number, number]>>,
} as const;

/** Table archétypes → postes possibles (spec §8, colonne "Positions"). */
export const ARCHETYPE_POSITIONS: Record<ArchetypeId, readonly Position[]> = {
  PLAYMAKER_PG: ["PG"],
  SCORING_COMBO_GUARD: ["PG", "SG"],
  THREE_AND_D: ["SG", "SF"],
  TWO_WAY_WING: ["SF", "PF"],
  ISOLATION_SCORER: ["SG", "SF"],
  STRETCH_FOUR: ["PF"],
  RIM_PROTECTOR: ["C"],
  MODERN_BIG: ["C"],
  OLD_SCHOOL_POST: ["PF", "C"],
  DEFENSIVE_PITBULL: ["PG", "SG"],
} as const;

/**
 * Profil `skills` par archétype (spec §8, colonnes "Points forts / Moyens / Faibles").
 * Ne couvre volontairement que `skills` (actif P1). Les mentions de la table
 * touchant au physique (ex. "speed", "wingspan haut", "strength") sont déjà
 * couvertes par `physicalRangeByPosition`/`heightRangeByPosition` (poste),
 * et celles touchant au mental (ex. "discipline", "ego souvent haut") sont
 * volontairement ignorées ici : la spec §8 précise que "mental et cachés
 * [sont] tirés indépendamment de la qualité technique" — implémenter ces
 * mentions ponctuelles créerait une exception non généralisable.
 * Seul `RIM_PROTECTOR` reçoit un biais physique dédié (`wingspanBias`),
 * explicitement nommé dans la spec ("wingspan haut").
 */
export interface ArchetypeSkillProfile {
  strong: readonly SkillKey[];
  medium: readonly SkillKey[];
  weak: readonly SkillKey[];
  /** Ailier tout-terrain : ignore strong/medium/weak, utilise `uniformWing`. */
  uniform?: boolean;
  wingspanBias?: "high";
}

export const ARCHETYPE_SKILL_PROFILES: Record<ArchetypeId, ArchetypeSkillProfile> = {
  PLAYMAKER_PG: {
    strong: ["passing", "courtVision", "ballHandling"],
    medium: ["midRange", "steal"],
    weak: ["finishing", "postPlay", "block"],
  },
  SCORING_COMBO_GUARD: {
    strong: ["finishing", "threePoint", "ballHandling"],
    medium: ["midRange"],
    weak: ["passing", "onBallDefense", "offBallDefense"],
  },
  THREE_AND_D: {
    strong: ["threePoint", "onBallDefense", "offBallDefense"],
    medium: ["steal", "defRebound"],
    weak: ["ballHandling", "passing"],
  },
  TWO_WAY_WING: {
    strong: [],
    medium: [],
    weak: [],
    uniform: true,
  },
  ISOLATION_SCORER: {
    strong: ["finishing", "midRange", "threePoint", "ballHandling"],
    medium: ["freeThrow"],
    weak: ["passing", "onBallDefense", "offBallDefense"],
  },
  STRETCH_FOUR: {
    strong: ["threePoint", "midRange"],
    medium: ["defRebound"],
    weak: ["postPlay", "onBallDefense"],
  },
  RIM_PROTECTOR: {
    strong: ["block", "defRebound"],
    medium: ["finishing"],
    weak: ["threePoint", "freeThrow", "passing"],
    wingspanBias: "high",
  },
  MODERN_BIG: {
    strong: ["finishing", "passing", "defRebound"],
    medium: ["midRange", "block"],
    weak: ["threePoint"],
  },
  OLD_SCHOOL_POST: {
    strong: ["postPlay", "offRebound"],
    medium: ["midRange"],
    weak: ["threePoint"],
  },
  DEFENSIVE_PITBULL: {
    strong: ["onBallDefense", "steal"],
    medium: ["offBallDefense", "defensiveIQ"],
    weak: ["finishing", "midRange", "threePoint", "freeThrow", "ballHandling", "passing", "courtVision", "postPlay"],
  },
} as const;

/** §4.2 — Traits mutuellement exclusifs par paires (spec-player-model.md §4.2). */
export const TRAIT_EXCLUSIVE_PAIRS: readonly (readonly [Trait, Trait])[] = [
  ["clutchKiller", "bigGameChoker"],
  ["metronome", "erratic"],
] as const;

/** Toutes les valeurs possibles de traits, pour tirage. */
export const ALL_TRAITS: readonly Trait[] = [
  "clutchKiller",
  "bigGameChoker",
  "playoffPerformer",
  "mentor",
  "toxicLockerRoom",
  "lateBloomer",
  "metronome",
  "erratic",
  "warrior",
  "mentallyFragile",
] as const;
