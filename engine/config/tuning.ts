import type {
  ArchetypeId,
  DefensiveAggressiveness,
  GameTier,
  GrowthCurve,
  InjurySeverity,
  OffensiveOrientation,
  Pace,
  Position,
  PlayerSkills,
  PressureContext,
  Trait,
} from "../types/index.js";

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
  /**
   * ⚙ Probabilités de base avant modificateurs, par décision (un tirage possible
   * à chaque étape [CHOIX D'ACTION], pas juste une fois par possession — spec §4).
   * Calibré (batch/calibrate, docs/decisions.md "Calibration Session D") pour
   * qu'une possession complète (souvent plusieurs décisions via les passes)
   * atterrisse sur un taux de turnover global ~12-15 % (cible ligue), pas 9 %.
   * Somme = 1.
   */
  base: {
    shot: 0.39,
    pass: 0.465,
    turnover: 0.062,
    foulDrawn: 0.08,
  },
  /** ⚙ Nombre maximum de passes par possession avant résolution forcée. */
  maxPassesPerPossession: 4,
  /** ⚙ En dessous de cette horloge (s), le tir est de plus en plus forcé (100 % à 0 s). */
  shotForcedBelowClockSeconds: 6,
} as const;

// ---------------------------------------------------------------------------
// §4 — Modificateurs du choix d'action (spec-possession-algorithm.md, tableau §4)
// ---------------------------------------------------------------------------
export const ACTION_MODIFIERS = {
  /** ⚙ Poids du différentiel (tir attaquant − défense adverse) dans p(tir). Valeur initiale — à calibrer. */
  shotSkillDeltaWeight: 0.006,
  /** ⚙ Poids courtVision/passing dans p(passe). Valeur initiale — à calibrer. */
  passSkillWeight: 0.004,
  /** ⚙ Malus de p(passe) par passe déjà effectuée dans la possession. Valeur initiale — à calibrer. */
  passDecayPerPass: 0.06,
  /** ⚙ Poids ballHandling/discipline (réduction) dans p(turnover). Valeur initiale — à calibrer. */
  turnoverHandlingWeight: 0.003,
  /** ⚙ Poids du steal du défenseur (augmentation) dans p(turnover). Valeur initiale — à calibrer. */
  turnoverDefenseStealWeight: 0.0025,
  /** ⚙ Poids finishing/postPlay (attaque du cercle) dans p(faute subie). Valeur initiale — à calibrer. */
  foulDrawnAttackWeight: 0.003,
  /**
   * ⚙ Poids de base de la cause "OFFENSIVE_FOUL" dans le tirage du turnover,
   * modulé depuis la Session 3 par `MENTAL.disciplineOffensiveFoulWeight` et
   * `discipline` du porteur (`resolveTurnover`, possession.ts) — remplace la
   * constante figée utilisée en P1/Session 1-2 (docs/decisions.md).
   * Valeur initiale — à calibrer.
   */
  turnoverOffensiveFoulBaseWeight: 15,
} as const;

// ---------------------------------------------------------------------------
// §5 — Sélection du type de tir (spec-possession-algorithm.md)
// ---------------------------------------------------------------------------
export const SHOT_SELECTION = {
  // p(shotType) ∝ baseX × f(attribut du tireur), f convexe.
  // Bases calibrées pour ~40 % de tirs à 3pts au niveau ligue (spec §5, §11).
  /** ⚙ calibré (batch/calibrate, Session D) pour ~38-42 % de tirs à 3pts. */
  baseThree: 0.42,
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
  /**
   * ⚙ k — attackFactor = 1 + k·(shooterAttr − 75)/100. Relevé depuis la valeur
   * spec (0.35) pour renforcer l'effet du talent individuel. Corrélation
   * talent→wins toujours instable d'une seed de ligue à l'autre (0.47-0.78 sur
   * batch de 50 saisons) même après calibration — voir docs/decisions.md
   * "Corrélation talent→wins instable" pour le détail et les pistes restantes.
   */
  attackFactorK: 0.6,
  /** ⚙ d — defenseFactor = 1 − d·(defAttr − 75)/100. Calibré (Session D), même raison que `attackFactorK`. */
  defenseFactorD: 0.5,
  /** ⚙ Bonus à domicile appliqué à pMake — calibré (Session D) pour ~55-60 % de victoires à domicile. */
  homeFactorBonus: 0.025,
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
   * ≥ `PRESSURE.highPressureThreshold` et `trueComposure` sous la neutre.
   * Actif depuis la Session 3 (`resolveFreeThrows`, possession.ts).
   */
  pressurePenalty: 0.03,
} as const;

// ---------------------------------------------------------------------------
// §7 — Rebond (spec-possession-algorithm.md)
// ---------------------------------------------------------------------------
export const REBOUND = {
  /**
   * ⚙ B — pOffensiveRebound = Σpoids_off / (Σpoids_off + B·Σpoids_def).
   * Calibré (batch/calibrate, Session D) pour ~26-28 % de rebonds offensifs au niveau ligue.
   */
  defensiveWeightMultiplierB: 2.6,
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
// §7 — Rebond offensif → putback (spec-possession-algorithm.md §7)
// ---------------------------------------------------------------------------
export const PUTBACK = {
  /** ⚙ Multiplicateur de p(tir au cercle) après rebond offensif ("fortement augmenté"). Valeur initiale — à calibrer. */
  rimBiasMultiplier: 2.5,
} as const;

// ---------------------------------------------------------------------------
// §8 — Consommation d'horloge (spec-possession-algorithm.md)
// ---------------------------------------------------------------------------
export const CLOCK_CONSUMPTION = {
  /**
   * ⚙ Mise en place, en secondes. Calibré (batch/calibrate, Session D) : la
   * fourchette spec (4-8s) produisait ~117-120 possessions/équipe/match au lieu
   * des ~99 ciblées (§1) — allongée pour ramener le rythme dans la cible sans
   * changer l'efficacité par possession (déjà réaliste).
   */
  setup: { min: 6, max: 11 },
  /** ⚙ Par passe, en secondes. */
  perPass: { min: 2, max: 5 },
  /** ⚙ Création du tir, en secondes. */
  shotCreation: { min: 2, max: 6 },
} as const;

// ---------------------------------------------------------------------------
// Tactiques d'équipe (P2, plan-développement §Phase 2 — Session 1)
// ---------------------------------------------------------------------------

/**
 * ⚙ Pace : multiplie la consommation d'horloge de l'équipe qui attaque
 * (mise en place, création de tir, chaque passe — spec-possession §8).
 * Valeurs initiales — à calibrer via batch pour retomber sur ~99 possessions/équipe
 * en moyenne ligue malgré la dispersion des profils.
 */
export const TACTICS_PACE_CLOCK_MULTIPLIER = {
  SLOW: 1.15,
  NORMAL: 1.0,
  FAST: 0.85,
} satisfies Record<Pace, number>;

/**
 * ⚙ Orientation offensive : biais multiplicatif sur les bases de sélection du
 * type de tir (spec-possession §5, `SHOT_SELECTION`). Valeurs initiales — à calibrer
 * pour produire des distributions de tirs visiblement différentes entre profils
 * (cible de calibration P2, docs/plan-developpement).
 */
export const TACTICS_OFFENSIVE_ORIENTATION_SHOT_BIAS = {
  THREE_POINT: { three: 1.35, midRange: 0.85, rim: 0.9 },
  BALANCED: { three: 1.0, midRange: 1.0, rim: 1.0 },
  INSIDE: { three: 0.7, midRange: 1.05, rim: 1.3 },
} satisfies Record<OffensiveOrientation, { three: number; midRange: number; rim: number }>;

/**
 * ⚙ Agressivité défensive : multiplie le poids de turnover forcé (steal) et de
 * faute subie côté attaque adverse (spec-possession §4). Valeurs initiales — à calibrer.
 */
export const TACTICS_DEFENSIVE_AGGRESSIVENESS = {
  LOW: { turnoverForcedMultiplier: 0.85, foulMultiplier: 0.85 },
  NORMAL: { turnoverForcedMultiplier: 1.0, foulMultiplier: 1.0 },
  HIGH: { turnoverForcedMultiplier: 1.25, foulMultiplier: 1.2 },
} satisfies Record<DefensiveAggressiveness, { turnoverForcedMultiplier: number; foulMultiplier: number }>;

/**
 * ⚙ Pressing tout terrain : multiplicateur supplémentaire (au-dessus de
 * `TACTICS_DEFENSIVE_AGGRESSIVENESS`) sur le turnover forcé et la faute subie
 * quand `pressing = true`. Valeur initiale — à calibrer.
 */
export const TACTICS_PRESSING_MULTIPLIER = {
  turnoverForcedMultiplier: 1.15,
  foulMultiplier: 1.1,
} as const;

// ---------------------------------------------------------------------------
// Rotations et fautes personnelles (P2, plan-développement §Phase 2 — Session 1)
// ---------------------------------------------------------------------------

export const ROTATION = {
  /** ⚙ Taille de la hiérarchie de rotation (titulaires + banc utilisé), sur un roster de 15. */
  rotationSize: 9,
  /**
   * ⚙ Minutes cibles sur 48 min réglementaires, par rang de hiérarchie
   * (rang 1 = meilleur titulaire). Les rangs au-delà de `targetMinutesByRank.length`
   * (fin de banc) reçoivent une cible de 0 — ils ne jouent qu'en cas de blessure (P2, session suivante).
   * Valeurs initiales — à calibrer.
   */
  targetMinutesByRank: [34, 32, 30, 28, 26, 22, 18, 14, 10],
  /** ⚙ Nombre de fautes personnelles entraînant la sortie définitive du match. */
  foulOutLimit: 6,
  /**
   * ⚙ Fautes personnelles au-delà desquelles un joueur est mis au repos temporaire
   * ("foul trouble"), indexé par quart-temps (index 0 = Q1, 1 = Q2, 2 = Q3).
   * Au Q4 et en prolongation, plus de mise au repos préventive (seul le foul-out
   * s'applique) — un entraîneur laisse jouer ses meilleurs joueurs en money time.
   */
  foulTroubleThresholdByQuarter: [2, 3, 4],
  /**
   * ⚙ Tolérance (en secondes) avant qu'un joueur en avance sur son rythme de
   * minutes cible ne soit sorti par la logique de rotation. Évite des allers-retours
   * incessants pour de petits écarts.
   */
  paceToleranceSeconds: 90,
  /**
   * ⚙ Durée minimale d'un passage sur le terrain (en secondes) avant que la
   * logique de rythme de minutes ne puisse sortir un joueur (garde-fou anti-oscillation :
   * sans ce plancher, un joueur de banc à faible cible de minutes est resorti
   * après ~2 min de jeu, produisant des dizaines de changements artificiels par
   * match). Ne s'applique pas au foul-out (toujours immédiat) ni au foul trouble.
   */
  minimumStintSeconds: 300,
} as const;

/**
 * ⚙ Règles d'assignation tactique des 29 IA depuis la composition de leur roster
 * (spec plan P2 §Session 1 : "IA tactique basique... profil choisi selon la
 * composition de leur roster"). Moyennes calculées sur les joueurs du roster
 * aux postes concernés ; au-dessus du seuil → profil correspondant, sinon `BALANCED`/`NORMAL`.
 * Valeurs initiales — à calibrer.
 */
export const TACTIC_ASSIGNMENT = {
  /**
   * ⚙ Écart minimal (points d'attribut) entre le profil tir extérieur et le profil
   * jeu intérieur du roster pour sortir du profil `BALANCED` (comparaison relative,
   * pas de seuil absolu — un seuil absolu sur `postPlay`/`strength` classait
   * systématiquement 23/30 équipes en `INSIDE`, `strength` étant élevé chez tous
   * les intérieurs indépendamment de leur identité offensive réelle).
   */
  offensiveOrientationMargin: 3,
  aggressiveDefenseThreshold: 68,
  passiveDefenseThreshold: 55,
  pressingStaminaThreshold: 72,
  fastPaceThreshold: 70,
  slowPaceThreshold: 55,
  /** ⚙ Tirage "hors-profil" (mirroir de `offArchetypeRate`) : un peu de variété entre équipes à composition proche. */
  offProfileRate: 0.12,
} as const;

// ---------------------------------------------------------------------------
// Fatigue et blessures (P2, plan-développement §Phase 2 — Session 2)
// ---------------------------------------------------------------------------

export const FATIGUE = {
  /**
   * ⚙ Perte de gameStamina par seconde passée sur le terrain (pace NORMAL).
   * Un titulaire à ~40 min réelles (déborde son quota cible) finit proche de 0.
   * Valeur initiale — à calibrer.
   */
  drainPerSecond: 100 / (40 * 60),
  /**
   * ⚙ Récupération par seconde passée au banc — plus rapide que le drain pour
   * que les rotations aient un effet net sur la fatigue. Valeur initiale — à calibrer.
   */
  recoveryPerSecond: 100 / (10 * 60),
  /** ⚙ Le pace de l'équipe module la vitesse de sa propre fatigue (plus de possessions/minute en FAST). */
  paceDrainMultiplier: {
    SLOW: 0.9,
    NORMAL: 1.0,
    FAST: 1.15,
  } satisfies Record<Pace, number>,
  /** ⚙ gameStaminaFactor(gameStamina) : pas de pénalité au-dessus de ce seuil. */
  noPenaltyThreshold: 70,
  /** ⚙ Pénalité d'attributs effectifs par point de gameStamina sous le seuil. */
  penaltyPerPoint: 0.006,
  /** ⚙ Plancher du facteur (pénalité max ~18 % à gameStamina 0). */
  minFactor: 0.82,
  /**
   * ⚙ Fitness inter-match (persiste sur toute la saison, contrairement à
   * gameStamina remis à niveau à chaque match). Coût en fitness par minute
   * jouée au match précédent.
   */
  fitnessWearPerMinute: 0.35,
  /** ⚙ Récupération de fitness avant un match avec repos normal. */
  restRecovery: 22,
  /**
   * ⚙ Récupération de fitness avant un match enchaîné (back-to-back), détecté
   * depuis la Session 4 à partir de vraies dates de calendrier (`SCHEDULE`,
   * schedule.ts) plutôt que du proxy stochastique de la Session 2.
   */
  backToBackRecovery: 6,
} as const;

/**
 * ⚙ Blessures probabilistes (plan-développement §Phase 2 — Session 2), fonction
 * de la fatigue courante, de `injuryProneness` (caché) et de l'âge (dérivé de
 * `birthDate`, référence `PLAYER_GENERATION.referenceDate` — pas de calendrier
 * saison réel en P2). Durées exprimées en matchs manqués, pas en jours
 * calendaires (même raison que `FATIGUE.backToBackRate`).
 * Vérifiée à chaque possession, pour chaque joueur sur le terrain (décision
 * produit Session 2 — cohérent avec le suivi des fautes déjà en place).
 */
export const INJURY = {
  /**
   * ⚙ calibré pour ~4-6 blessures significatives par équipe et par saison
   * (plan-développement §Phase 2). Ajusté de 0.00006 à 0.00005 après un batch
   * de contrôle 10 saisons mesurant 6.3/équipe/saison (docs/decisions.md).
   */
  baseProbPerPossession: 0.00005,
  /** ⚙ Sous `fatigueThreshold`, +X %/point de gameStamina manquant. */
  fatigueThreshold: 60,
  fatigueMultiplierPerPoint: 0.02,
  /** ⚙ `injuryProneness` moyen de génération (`PLAYER_GENERATION.hidden.injuryProneness.mean`) → multiplicateur neutre 1. */
  proneNeutral: 30,
  /** ⚙ Plancher du multiplicateur de proneness (un joueur très peu sujet aux blessures n'est jamais à 0 risque). */
  pronenessFloor: 0.3,
  /** ⚙ Au-delà de cet âge, +X %/an de risque. */
  ageNeutral: 27,
  ageMultiplierPerYear: 0.05,
  /** ⚙ Table de sévérité : poids de tirage + fourchette de matchs manqués. */
  types: [
    { severity: "MINOR", weight: 0.6, gamesRange: [1, 3] },
    { severity: "MODERATE", weight: 0.3, gamesRange: [4, 10] },
    { severity: "SEVERE", weight: 0.1, gamesRange: [15, 40] },
  ] satisfies readonly { severity: InjurySeverity; weight: number; gamesRange: readonly [number, number] }[],
} as const;

// ---------------------------------------------------------------------------
// Pression et mental (P2, plan-développement §Phase 2 — Session 3)
// ---------------------------------------------------------------------------

/**
 * ⚙ pressureScore = base(gameTier) + clutchTime + eliminationStake + game7
 * (spec-player-model §7). Le "rivalité / affluence hostile" de la spec est
 * hors scope (aucun système de rivalité/affluence n'existe — décision session 3,
 * voir docs/decisions.md). Valeurs initiales — à calibrer.
 */
export const PRESSURE = {
  baseByGameTier: {
    REGULAR_SEASON: 10,
    PLAY_IN: 40,
    PLAYOFFS: 50,
    FINALS: 65,
  } satisfies Record<GameTier, number>,
  /** Définition littérale du "clutch time" (spec §7) : écart ≤ 5 pts ET ≤ 5 min au Q4/OT. */
  clutchScoreMarginMax: 5,
  clutchClockSecondsMax: 5 * 60,
  clutchTimeBonus: 20,
  eliminationBonus: 20,
  game7Bonus: 15,
  /** `trueComposure` moyen de génération (`PLAYER_GENERATION.hidden.trueComposure.mean`) → modificateur neutre. */
  composureNeutral: 55,
  /** ⚙ sensibilité du modificateur au produit (écart de composure × pressureScore). */
  composureSensitivity: 0.006,
  /** ⚙ malus max ~-15 à -20 % au pic de pression pour composure faible (spec §7). */
  maxMalus: 0.2,
  /** ⚙ léger boost au-delà de la composure neutre au pic de pression (spec §7 "boostés au-delà de 90"). */
  maxBoost: 0.06,
  /** ⚙ Seuil de pressureScore au-delà duquel le malus de lancers francs (FREE_THROW.pressurePenalty) s'applique. */
  highPressureThreshold: 55,
  /** ⚙ Bonus/malus des traits "Tueur du money time"/"Peur des grands matchs", déclenchés par isClutchTime (moment littéral, pas le score composite). */
  clutchKillerBonus: 0.08,
  bigGameChokerMalus: 0.12,
  /** ⚙ Trait "Joueur de playoffs" : bonus play-in/playoffs/finales, léger malus en saison régulière. */
  playoffPerformerBonus: 0.04,
  playoffPerformerRegularSeasonMalus: 0.02,
  /** ⚙ Bornes finales du modificateur de pression, toutes causes cumulées. */
  minModifier: 0.65,
  maxModifier: 1.15,
  /** ⚙ `leadership` neutre (fourchette de génération mentale [20,95], centre ~57). */
  leadershipNeutral: 50,
  /** ⚙ sensibilité du buffer de leadership (amortit le malus des coéquipiers, jamais soi-même — spec §7). */
  leadershipBufferSensitivity: 0.002,
} as const;

/**
 * ⚙ Modificateurs mentaux hors pression : discipline (turnover), variance de
 * performance (métronome/erratique), et bonus Guerrier (spec §4.2, plan P2 §Session 3).
 */
export const MENTAL = {
  /**
   * ⚙ discipline réduit le poids de base de la cause OFFENSIVE_FOUL du turnover
   * (remplace la constante figée `ACTION_MODIFIERS.turnoverOffensiveFoulBaseWeight`
   * utilisée en P1/Session 1-2, TODO documenté depuis P1 — voir docs/decisions.md).
   */
  disciplineOffensiveFoulWeight: 0.008,
  /** ⚙ Guerrier : atténue la pénalité de fatigue (blend vers 1) et accélère le retour de blessure. */
  warriorFatiguePenaltyReduction: 0.4,
  warriorInjuryRecoveryMultiplier: 0.7,
  /** ⚙ Écart-type du bruit de variance de performance par match (spec "peu/beaucoup de très bons-mauvais matchs"). */
  metronomeVarianceStdDev: 0.03,
  erraticVarianceStdDev: 0.1,
  /** ⚙ Bornes du facteur de bruit, centré sur 1 — évite les extrêmes déraisonnables. */
  varianceFactorMin: 0.7,
  varianceFactorMax: 1.3,
} as const;

/**
 * Modificateur de pression (spec-player-model.md §7) : composure/traits/leadership
 * pilotent les attributs effectifs en fonction du contexte de match. Actif dès
 * la Session 3 (P2) — identité en Session 1-2 (`pressureScore` toujours à 0).
 */
export function pressureModifier(trueComposure: number, traits: readonly Trait[], context: PressureContext): number {
  const { pressureScore, isClutchTime, gameTier } = context;

  const composureDelta = trueComposure - PRESSURE.composureNeutral;
  let mod = 1 + (composureDelta * pressureScore * PRESSURE.composureSensitivity) / 100;
  mod = Math.max(1 - PRESSURE.maxMalus, Math.min(1 + PRESSURE.maxBoost, mod));

  if (isClutchTime) {
    if (traits.includes("clutchKiller")) mod *= 1 + PRESSURE.clutchKillerBonus;
    if (traits.includes("bigGameChoker")) mod *= 1 - PRESSURE.bigGameChokerMalus;
  }

  if (traits.includes("playoffPerformer")) {
    mod *= gameTier === "REGULAR_SEASON" ? 1 - PRESSURE.playoffPerformerRegularSeasonMalus : 1 + PRESSURE.playoffPerformerBonus;
  }

  return Math.max(PRESSURE.minModifier, Math.min(PRESSURE.maxModifier, mod));
}

// ---------------------------------------------------------------------------
// Calendrier à jours réels (P2, plan-développement §Phase 2 — Session 4)
// ---------------------------------------------------------------------------

/**
 * ⚙ Calendrier de saison régulière à jours réels (schedule.ts), remplaçant le
 * proxy stochastique de back-to-back de la Session 2 (`docs/decisions.md`
 * "Modèle de repos inter-matchs") maintenant que le mode match live a besoin
 * d'une vraie date par match. `seasonStartDate` est un point de référence fixe
 * (jamais `Date.now()`, même raison que `PLAYER_GENERATION.referenceDate`) :
 * seul l'écart en jours entre deux dates ISO est utilisé, jamais la date
 * calendaire réelle actuelle.
 */
export const SCHEDULE = {
  seasonStartDate: "2026-10-21",
  /**
   * ⚙ Pilote indirectement `targetGamesPerDay` dans `assignDates` (schedule.ts) :
   * plus cette valeur est basse, plus de matchs sont tassés par jour, et plus
   * le taux de back-to-back qui en émerge est élevé. Calibré (batch de contrôle,
   * docs/decisions.md) pour ~26 % de matchs en back-to-back par équipe — proche
   * des ~30 % observés en NBA réelle — sur une saison étalée sur ~160 jours
   * (21 oct. → fin mars).
   */
  seasonLengthDays: 160,
} as const;

// ---------------------------------------------------------------------------
// Mode match live (P2, plan-développement §Phase 2 — Session 4)
// ---------------------------------------------------------------------------

/**
 * ⚙ Temps-morts appelables par un GM en mode match live (`gameEngine.ts`,
 * `callTimeout`). Effet volontairement simple (décision produit Session 4) :
 * une petite récupération de `gameStamina` pour les 5 joueurs sur le terrain
 * de l'équipe concernée, plus une fenêtre libre pour changer tactiques/
 * rotations sans attendre la prochaine vérification automatique. Pas d'effet
 * "adversaire refroidi"/momentum — hors scope (mental/momentum, P3+).
 */
export const TIMEOUT = {
  perTeamPerGame: 7,
  staminaRecovery: 8,
} as const;

// ---------------------------------------------------------------------------
// Hooks prévus par les specs — actifs à partir de P2, renvoient 1 en P1
// (CLAUDE.md — scope P1 : "Les hooks... existent mais renvoient 1.")
// ---------------------------------------------------------------------------

/** Facteur de stamina intra-match (spec-possession-algorithm.md §3, plan P2 §Session 2). */
export function gameStaminaFactor(gameStamina: number): number {
  if (gameStamina >= FATIGUE.noPenaltyThreshold) return 1;
  const deficit = FATIGUE.noPenaltyThreshold - gameStamina;
  return Math.max(FATIGUE.minFactor, 1 - deficit * FATIGUE.penaltyPerPoint);
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
  /** ⚙ Blessures significatives par équipe et par saison (plan-développement §Phase 2 — Session 2). */
  injuriesPerTeamPerSeason: { min: 4, max: 6 },
  /** ⚙ Âge moyen de la ligue, batch multi-saisons (plan-développement §Phase 3 — Session 1 : "âge moyen ~26 ans, stable"). */
  leagueAverageAge: { min: 24, max: 28 },
} as const;

/**
 * Bornes des tests statistiques automatisés (famille 3, spec-tests-phase1.md §3).
 * Volontairement plus larges que `LEAGUE_TARGETS` (curseurs de calibration
 * manuelle, spec-possession-algorithm §11) — la spec des tests distingue
 * explicitement les deux : la tolérance plus large évite qu'un test CI
 * devienne flaky sur de la variance statistique normale.
 */
export const STATISTICAL_TEST_TARGETS = {
  pointsPerTeamPerGame: { min: 108, max: 122 },
  fgPercent: { min: 0.45, max: 0.49 },
  threePointAttemptShare: { min: 0.36, max: 0.44 },
  threePointPercent: { min: 0.34, max: 0.38 },
  turnoversPerTeamPerGame: { min: 11, max: 16 },
  offensiveReboundShare: { min: 0.24, max: 0.3 },
  homeWinPercent: { min: 0.53, max: 0.62 },
  topScorerPpg: { min: 26, max: 35 },
  bestTeamWins: { min: 55, max: 68 },
  worstTeamWins: { min: 10, max: 23 },
  talentWinsCorrelationMin: 0.7,
  /** ⚙ Tolérance plus large que `LEAGUE_TARGETS.injuriesPerTeamPerSeason` (même raison que les autres curseurs). */
  injuriesPerTeamPerSeason: { min: 2.5, max: 8 },
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

// ---------------------------------------------------------------------------
// Progression, vieillissement, retraites (P3, plan-développement §Phase 3 — Session 1)
// ---------------------------------------------------------------------------

/**
 * ⚙ Courbes de carrière (spec-player-model.md §5 : `potential`, `growthCurve`,
 * `peakAge`, `declineRate`). Toutes les valeurs sont des points de départ non
 * calibrés — curseurs du batch 20 saisons (plan-développement §Phase 3,
 * critère "âge moyen ~26 ans, distribution stable").
 */
export const DEVELOPMENT = {
  /** ⚙ Décalage (années) du pic effectif selon `growthCurve` — précoce pique/décline plus tôt, tardif plus tard. */
  growthCurveOffsetYears: { early: -2, standard: 0, late: 2 } satisfies Record<GrowthCurve, number>,
  /** ⚙ Le physique pique avant le technique (spec plan P3 §Session 1 : "les attributs physiques déclinent avant les techniques"). */
  physicalPeakLeadYears: 1,
  technicalPeakLagYears: 1,
  /** `workEthic`/`coachability` neutres — centre de `PLAYER_GENERATION.mentalRange` [20, 95]. */
  mentalNeutral: 57.5,

  progression: {
    /** ⚙ Gain plafond par attribut et par saison, avant tous les facteurs multiplicatifs. */
    maxAnnualGain: 6,
    /** ⚙ potentialFactor = clamp(gap / ce diviseur, 0, 1) — gap = potential − valeur actuelle. */
    potentialGapDivisor: 25,
    /** ⚙ ageFactor = clamp((peakAge − age) / span, floor, 1) — plus jeune progresse plus vite. */
    ageFactorSpanYears: 9,
    ageFactorFloor: 0.15,
    /** ⚙ Poids du multiplicateur centré sur `mentalNeutral` pour workEthic/coachability. */
    workEthicWeight: 0.5,
    coachabilityWeight: 0.3,
    /** ⚙ minutesFactor = clamp(minutesShare, floor, 1) — un jeune sur le banc progresse quand même un peu. */
    minutesFloor: 0.3,
  },

  decline: {
    /** ⚙ Perte annuelle de base une fois le pic de catégorie dépassé. Physique décline plus vite que technique. */
    physicalBaseAnnualLoss: 1.4,
    technicalBaseAnnualLoss: 0.9,
    /** ⚙ declineRateFactor = base + declineRate × poids — centré ~1 pour `declineRate` moyen (50). */
    declineRateFactorBase: 0.4,
    declineRateFactorWeight: 0.012,
    /** ⚙ Le déclin s'accélère avec les années passées au-delà du pic. */
    accelerationPerYear: 0.08,
    /** ⚙ `workEthic` atténue (ou aggrave) le déclin — plancher/plafond du facteur de mitigation. */
    workEthicMitigationDivisor: 200,
    mitigationFloor: 0.7,
    mitigationCeil: 1.3,
  },

  /** ⚙ Micro-progression en cours de saison pour les jeunes à fort temps de jeu (spec plan P3 §Session 1). */
  microProgression: {
    maxAge: 23,
    minMinutesShare: 0.5,
    /** ⚙ Bonus flat additionnel sur les attributs techniques uniquement (effet "visible mais léger"). */
    flatBonus: 0.4,
  },

  /** ⚙ Minutes de saison "pleine charge" pour normaliser `minutesShare` (~34 min × 79 matchs, titulaire type). */
  referenceSeasonMinutes: 2686,

  /**
   * ⚙ Fourchette d'âge des remplaçants générés à l'intersaison en l'absence de
   * draft (`offseason.ts`, filet temporaire documenté docs/decisions.md — remplacé
   * par de vrais rookies draftés en Session 2). Volontairement plus étroite que
   * `PLAYER_GENERATION.ageRange` [19,38] : un remplaçant "générique" pigé dans la
   * pleine fourchette pourrait être un vétéran de 35 ans, ce qui ne renouvelle
   * jamais la ligue et empêche l'âge moyen de se stabiliser (constaté sur batch
   * de contrôle : ligue vieillissant sans fin, plafond ~31 ans jamais atteint
   * par manque de sang neuf). Alignée sur la fourchette "draft" mentionnée pour
   * la Session 2 (spec plan P3 "18-22 ans").
   */
  replacementAgeRange: { min: 19, max: 22 },

  retirement: {
    /**
     * ⚙ Au-delà de cet âge, probabilité de retraite croissante avec l'âge.
     * Calibré (batch de contrôle 20 saisons, seed `fblm-p3-session1-control`) :
     * 34 stabilisait l'âge moyen ligue autour de ~31 ans (hors cible [24-28]) —
     * abaissé à 32 avec une pente un peu plus forte, stabilise autour de ~26-27.
     */
    baseAgeThreshold: 32,
    probPerYearOverThreshold: 0.14,
    /** ⚙ Un joueur vieillissant ET à niveau faible part plus tôt (fin de banc, pas de rôle). */
    lowRatingAgeThreshold: 28,
    lowRatingThreshold: 55,
    lowRatingProb: 0.08,
    /** ⚙ Retraite forcée (garde-fou, aucune ligue NBA-like ne voit un joueur de 43 ans). */
    hardRetireAge: 42,
  },
} as const;

// ---------------------------------------------------------------------------
// Classes de draft et lottery (P3, plan-développement §Phase 3 — Session 2)
// ---------------------------------------------------------------------------

/**
 * ⚙ Génération d'une classe de draft annuelle : prospects 18-22 ans, attributs
 * techniques actuels faibles (pas encore développés) mais potentiel variable
 * et plus dispersé qu'un joueur confirmé — plus de busts et de "steals" que la
 * génération standard (`PLAYER_GENERATION`). Valeurs initiales — à calibrer.
 */
export const DRAFT_GENERATION = {
  classSize: { min: 60, max: 70 },
  ageRange: { min: 18, max: 22 },
  /** ⚙ Chaque skill technique généré (génération standard) est resserré vers le bas d'un facteur multiplicatif. */
  skillDiscount: 0.65,
  /** ⚙ `potential` d'un prospect : variance plus large que `PLAYER_GENERATION.hidden.potential` (busts/steals). */
  potential: { mean: 62, stdDev: 24 },
  /**
   * ⚙ Qualité de cuvée (bonnes/mauvaises années, spec plan P3 §Session 2) :
   * décalage tiré une fois par classe, appliqué à la moyenne de `potential`
   * de toute la promotion — borné pour éviter une cuvée absurdement
   * dégénérée (`classQualityMax`).
   */
  classQualityStdDev: 8,
  classQualityMax: 18,
} as const;

/**
 * ⚙ Draft lottery (style NBA post-2019, spec plan P3 §Session 2 : "les 3 pires
 * équipes à égalité de chances pour le pick 1"). Format de compétition repris
 * tel quel (non protégé, CLAUDE.md — "structure de ligue... formats de
 * compétition... repris car non protégée").
 */
export const DRAFT_LOTTERY = {
  /** Équipes non qualifiées aux playoffs, éligibles à la lottery (30 équipes − 16 places de playoffs/play-in). */
  lotteryTeamCount: 14,
  /**
   * Odds (pour 1000) du pick 1, indexées par rang inversé (0 = pire bilan de
   * la ligue). Table NBA post-2019 : les 3 pires équipes à égalité (14 %
   * chacune), somme = 1000.
   */
  pickOneOddsPerThousand: [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5],
  /** Nombre de picks réellement tirés par la lottery (1 à 4) ; le reste suit le classement inversé. */
  drawnPicksCount: 4,
  /** Nombre de tours de draft (spec plan P3 §Session 2 : "draft 2 tours"). */
  roundCount: 2,
} as const;

/**
 * ⚙ Scouting des prospects (spec plan P3 §Session 3, spec-player-model §5 :
 * "le scouting ne renvoie que des fourchettes, dont la précision dépend du
 * budget scouting alloué — simple curseur en P3 — et se resserre au fil de
 * la saison"). Chaque équipe a son propre curseur (`Team.scoutingQuality`) et
 * son propre biais d'évaluation persistant (`Team.scoutingBias`, "certaines
 * équipes scoutent mal") : deux équipes ne voient donc pas les mêmes
 * fourchettes pour un même prospect — source de busts/steals différents
 * d'une équipe à l'autre.
 */
export const SCOUTING = {
  /** ⚙ Demi-largeur de la fourchette à investissement 0 (aucune certitude). */
  maxUncertainty: 18,
  /** ⚙ Demi-largeur de la fourchette à investissement 1 (scouting maximal, jamais parfait). */
  minUncertainty: 3,
  /** ⚙ Écart-type du bruit gaussien appliqué à la vraie valeur, en fraction de l'incertitude. */
  noiseFactor: 0.6,
  /** ⚙ Investissement de la "passe rapide" servant uniquement à classer le buzz de la classe (résolution du rang, pas encore un vrai scouting). */
  buzzPassInvestment: 0.15,
  /** ⚙ Part de la classe (triée par buzz) qui reçoit un bonus d'attention universel ("tout le monde regarde les prospects réputés"), au-delà du budget propre à chaque équipe. */
  buzzTopShare: 0.2,
  buzzMidShare: 0.35,
  buzzAttentionBonus: { top: 0.15, mid: 0.05 },
  /**
   * ⚙ Le potentiel reste toujours plus incertain que le niveau actuel, même à
   * investissement maximal (spec-player-model §5 : "potentiel" est cité comme
   * l'attribut caché par excellence) — facteur multiplicatif < 1 appliqué à
   * l'investissement uniquement pour le calcul de la fourchette de potentiel.
   */
  potentialInvestmentPenalty: 0.6,
  /**
   * ⚙ "Se resserre au fil de la saison" : un rapport mi-saison est généré avec
   * un investissement réduit (fourchettes plus larges) en plus du rapport
   * final (juste avant le draft, investissement plein) — même prospect, deux
   * tirages de bruit indépendants, pour visualiser la progression (UI P3/P4).
   */
  midSeasonInvestmentFactor: 0.55,
  /** ⚙ Curseur de budget scouting par équipe (0-1), tiré une fois à la génération de la ligue — persiste comme trait d'identité de la franchise. */
  teamQuality: { mean: 0.55, stdDev: 0.2, min: 0.1, max: 0.95 },
  /** ⚙ Biais d'évaluation systématique par équipe, en points d'overall apparent (peut être positif ou négatif, ±`max`). */
  teamBias: { stdDev: 6, max: 16 },
  /** ⚙ Investissement final minimal pour qu'une équipe obtienne la moindre estimation de `trueComposure`/traits cachés. */
  hiddenRevealThreshold: 0.85,
  /** ⚙ Fourchette de `trueComposure` révélée, élargie par rapport à un skill normal même au-delà du seuil (toujours "avec incertitude"). */
  hiddenAttributeUncertaintyFactor: 1.3,
  /** ⚙ Même à investissement maximal, un vrai trait caché peut ne pas être détecté... */
  traitRevealProbability: 0.85,
  /** ⚙ ...et un faux positif (trait suspecté à tort) peut apparaître. */
  traitFalsePositiveChance: 0.1,
} as const;

/**
 * ⚙ IA de draft des autres équipes (spec plan P3 §Session 3 : "besoins +
 * meilleur talent disponible"). L'IA classe les prospects sur leur valeur
 * *apparente* (scoutée, jamais la vraie valeur) additionnée d'un bonus de
 * besoin positionnel.
 */
export const DRAFT_AI = {
  /** ⚙ Poids du bonus de besoin (0-1) dans le score de décision, en points d'overall apparent. */
  needWeight: 8,
  /** ⚙ Rating moyen au-dessus duquel un poste est considéré "pourvu" (besoin = 0). */
  needNormalizationRating: 65,
} as const;

/**
 * ⚙ Summer League (plan-développement §Phase 3 — Session 4) : mini-tournoi
 * post-draft où rookies et jeunes joueurs (< `eligibleSeasons` saisons dans la
 * ligue) obtiennent un micro-boost de progression et un affinage du scouting
 * de leur propre équipe. Pas de simulation possession par possession (un
 * roster n'a souvent que 2-4 joueurs éligibles par équipe, insuffisant pour un
 * vrai 5x5) : une "note de performance" statistique par joueur en tient lieu,
 * tirée à partir de ses attributs actuels + variance — volontairement léger,
 * cohérent avec l'esprit "vitrine des rookies" plutôt qu'une vraie compétition
 * à simuler en détail.
 */
export const SUMMER_LEAGUE = {
  /** ⚙ Éligibilité : moins de N saisons dans la ligue (`PlayerState.seasonsInLeague`). */
  eligibleSeasons: 3,
  /** ⚙ Écart-type de la note de performance individuelle (centrée sur l'overall actuel du joueur). */
  performanceStdDev: 12,
  /** ⚙ Bonus flat de progression appliqué aux skills techniques d'un participant, en plus de la progression normale d'intersaison. */
  progressionBonus: 0.6,
  /** ⚙ Bonus d'investissement scouting propre à la Summer League : l'équipe qui voit jouer son jeune en vrai affine son évaluation, plafonné à 1. */
  scoutingInvestmentBonus: 0.25,
  /** ⚙ Baseline d'âge utilisée pour reconstituer `seasonsInLeague` des rosters initiaux (`generateRoster`) — approxime l'âge d'entrée moyen dans la ligue. */
  initialTenureAgeBaseline: 20,
  /** ⚙ Plafond de `seasonsInLeague` bootstrap pour un roster initial (évite des "carrières" de 18 saisons absurdes pour un joueur généré à 38 ans). */
  initialTenureMax: 15,
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
