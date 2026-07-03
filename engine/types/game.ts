import type { GameContextInfo, Position, TeamSide } from "./common.js";
import type { Event, InjurySeverity } from "./event.js";
import type { Player, PlayerPhysical, PlayerSkills } from "./player.js";
import type { TeamTactics } from "./team.js";

export type GameStatus = "SCHEDULED" | "IN_PROGRESS" | "FINAL";

/** Match — entité persistée (calendrier, résultat, log complet). */
export interface Game {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  status: GameStatus;
  homeScore: number;
  awayScore: number;
  quarter: number; // dernier quart-temps atteint (5+ = prolongations)
  /** Play-by-play complet — source de vérité, box score dérivé de ce log. */
  events: Event[];
}

/**
 * Attributs effectifs d'un joueur sur le terrain, après application des hooks
 * de modificateurs (pressureModifier, gameStaminaFactor — P1 : hooks = identité).
 */
export interface EffectiveAttributes extends PlayerPhysical, PlayerSkills {}

export interface OnCourtPlayer {
  player: Player;
  effective: EffectiveAttributes;
}

/** Un emplacement de la hiérarchie de rotation d'une équipe (spec plan P2 §Session 1). */
export interface RotationSlot {
  playerId: string;
  position: Position;
  /** 1 = meilleur de la hiérarchie (titulaire prioritaire). */
  rank: number;
  /** Minutes cibles sur 48 min réglementaires (avant prolongation), spec ROTATION. */
  targetMinutes: number;
}

/** Hiérarchie de rotation d'une équipe, construite une fois par match depuis le roster complet. */
export interface RotationPlan {
  hierarchy: RotationSlot[];
}

/**
 * État de rotation vivant pendant un match : temps réellement joué par joueur,
 * fautes personnelles cumulées (jamais remises à zéro), et mise au repos
 * temporaire en cas de fautes précoces (spec plan P2 §Session 1).
 */
export interface GameRotationState {
  plan: RotationPlan;
  /** Index playerId → emplacement, construit une fois (évite un `.find()` sur la hiérarchie à chaque possession). */
  slotByPlayerId: ReadonlyMap<string, RotationSlot>;
  cumulativeSeconds: Record<string, number>;
  /** Quart-temps à partir duquel le joueur redevient éligible (mise au repos foul trouble). */
  benchedUntilQuarter: Record<string, number>;
  /**
   * Temps de jeu écoulé (secondes) au moment où le joueur actuellement sur le
   * terrain a entamé son passage en cours — sert de garde-fou anti-oscillation
   * pour la logique de rythme de minutes (spec plan P2 §Session 1). Absent = 0
   * (le joueur est là depuis le début du match, ex. les 5 titulaires).
   */
  stintStartSeconds: Record<string, number>;
}

/**
 * État transitoire consommé/produit par `resolvePossession` (spec-possession-algorithm.md §1).
 * Contient les 5 joueurs sur le terrain de chaque équipe, le score, l'horloge,
 * le quart-temps, les fautes d'équipe, le contexte domicile/extérieur.
 */
export interface GameState {
  game: Game;
  clockSeconds: number; // horloge du quart-temps courant, 0-720 (12 min)
  quarter: number;
  /** Fautes d'équipe du quart-temps courant (remises à zéro à chaque quart-temps). */
  teamFouls: Record<TeamSide, number>;
  /** Fautes personnelles cumulées sur tout le match (jamais remises à zéro, spec P2 §7 fautes). */
  personalFouls: Record<string, number>;
  /** Équipe qui a actuellement la balle. */
  possession: TeamSide;
  onCourt: Record<TeamSide, OnCourtPlayer[]>; // 5 joueurs par équipe
  /** Profil tactique de chaque équipe (P2). */
  tactics: Record<TeamSide, TeamTactics>;
  /** Hiérarchie de rotation et minutes/fautes vivantes de chaque équipe (P2). */
  rotation: Record<TeamSide, GameRotationState>;
  /**
   * Fatigue intra-match courante (0-100), toutes équipes confondues (plan P2
   * §Session 2). État de simulation dérivé, pas lu depuis `player.state` figé
   * à la génération — seule la valeur de départ vient de la fitness saison
   * (season.ts), jamais recalculée à partir du log d'événements.
   */
  gameStamina: Record<string, number>;
  /** Blessures survenues pendant ce match (plan P2 §Session 2), sortie forcée définitive. */
  injuries: Record<string, { severity: InjurySeverity; gamesOut: number }>;
  /**
   * Facteur de variance de performance par match (plan P2 §Session 3, traits
   * métronome/erratique), tiré une fois par joueur au début du match — 1 (neutre)
   * pour tout joueur sans l'un des deux traits. Appliqué aux `skills` de
   * `OnCourtPlayer.effective`, y compris pour les entrants en cours de match
   * (rotation.ts), pour rester cohérent entre le 5 de départ et le banc.
   */
  variance: Readonly<Record<string, number>>;
  context: {
    homeTeamId: string;
    awayTeamId: string;
  } & GameContextInfo;
}
