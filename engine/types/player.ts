import type { Handedness, Position } from "./common.js";

/**
 * Schéma complet du modèle Player (docs/spec-player-model.md).
 * Le schéma existe en entier dès la phase 1 ; seuls les blocs `physical` et
 * `skills` sont *actifs* dans la simulation P1 (spec §9 — activation par phase).
 * Les autres blocs sont typés, générés, mais non consommés par le moteur avant
 * leur phase d'activation.
 */

/** 10 archétypes de génération (spec §8). */
export type ArchetypeId =
  | "PLAYMAKER_PG" // Meneur gestionnaire
  | "SCORING_COMBO_GUARD" // Combo guard scoreur
  | "THREE_AND_D" // 3&D
  | "TWO_WAY_WING" // Ailier tout-terrain
  | "ISOLATION_SCORER" // Scoreur d'isolation
  | "STRETCH_FOUR" // Stretch four
  | "RIM_PROTECTOR" // Protecteur de cercle
  | "MODERN_BIG" // Pivot moderne
  | "OLD_SCHOOL_POST" // Poste bas old school
  | "DEFENSIVE_PITBULL"; // Pitbull défensif

/** Profil de courbe de progression (spec §5, actif P3). */
export type GrowthCurve = "early" | "standard" | "late";

/**
 * Traits discrets (spec §4.2). Paires mutuellement exclusives par construction :
 * clutchKiller/bigGameChoker, metronome/erratic — la génération (P2+) doit le
 * respecter, jamais les deux d'une même paire sur un joueur.
 */
export type Trait =
  | "clutchKiller" // Tueur du money time
  | "bigGameChoker" // Peur des grands matchs (peut être caché tant que non observé)
  | "playoffPerformer" // Joueur de playoffs
  | "mentor" // Mentor
  | "toxicLockerRoom" // Vestiaire toxique
  | "lateBloomer" // Fond de forme tardif (mois 4-6)
  | "metronome" // Variance de performance réduite
  | "erratic" // Variance de performance élevée
  | "warrior" // Guerrier (retour de blessure, joue mieux fatigué)
  | "mentallyFragile"; // Fragile mentalement

export interface PlayerIdentity {
  id: string;
  firstName: string;
  lastName: string;
  /** Date ISO. L'âge est toujours dérivé au moment de l'usage, jamais stocké. */
  birthDate: string;
  heightCm: number; // 175-225
  weightKg: number; // cohérent avec heightCm (IMC plausible)
  wingspanCm: number; // heightCm + [0, 15]
  position: Position;
  /** 0 à 2 postes secondaires. */
  secondaryPositions: Position[];
  handedness: Handedness;
  /** 0-99, unique par équipe. */
  jerseyNumber: number;
  /** Ville/région fictive FBL, purement narratif. */
  origin: string;
}

/** §2 — Physique, 0-99, actif dès P1. */
export interface PlayerPhysical {
  speed: number;
  vertical: number;
  strength: number;
  lateralQuickness: number;
  stamina: number;
}

/** §3 — Technique, 0-99, actif dès P1. */
export interface PlayerSkills {
  // Attaque
  finishing: number;
  midRange: number;
  threePoint: number;
  freeThrow: number;
  ballHandling: number;
  passing: number;
  courtVision: number;
  postPlay: number;
  // Défense
  onBallDefense: number;
  offBallDefense: number;
  block: number;
  steal: number;
  offRebound: number;
  defRebound: number;
  defensiveIQ: number;
}

/** §4 — Mental, actif dès P2. */
export interface PlayerMental {
  leadership: number;
  composure: number;
  competitiveness: number;
  discipline: number;
  coachability: number;
  workEthic: number;
  ego: number;
  /** 0 à 3 traits. */
  traits: Trait[];
}

/** §5 — Attributs cachés, jamais affichés bruts. Actifs par sous-champ (P2/P3). */
export interface PlayerHidden {
  potential: number; // P3 — plafond de progression global
  growthCurve: GrowthCurve; // P3
  injuryProneness: number; // P2 — probabilité de blessure
  trueComposure: number; // P2 — vrai clutch, distinct de `mental.composure` affiché
  peakAge: number; // P3
  declineRate: number; // P3
}

/** §6 — État dynamique, recalculé pendant la simulation, jamais généré à la création. */
export interface PlayerState {
  morale: number;
  fitness: number; // fatigue long terme
  gameStamina: number; // fatigue intra-match
  injury: { type: string | null; remainingGames: number };
  form: number; // rolling des 10 derniers matchs
  /**
   * Nombre de saisons complètes passées dans la ligue (P3 §Session 4 : éligibilité
   * Summer League "rookies et jeunes < 3 saisons"). 0 à la génération (`generatePlayer`),
   * incrémenté à chaque intersaison (`runOffseason`) pour les joueurs qui restent sur un
   * roster. Les rosters initiaux de `generateLeague` reçoivent une valeur bootstrap
   * dérivée de l'âge (une ligue ne démarre pas peuplée uniquement de rookies).
   */
  seasonsInLeague: number;
}

export interface Player extends PlayerIdentity {
  physical: PlayerPhysical;
  skills: PlayerSkills;
  mental: PlayerMental;
  hidden: PlayerHidden;
  state: PlayerState;
  /** Traçabilité de génération — donnée d'inspection, aucune incidence sur la simulation. */
  generation: {
    archetypeId: ArchetypeId;
    offArchetype: boolean; // tirage "hors-archétype" (~10 %, spec §8)
  };
}
