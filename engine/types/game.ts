import type { TeamSide } from "./common.js";
import type { Event } from "./event.js";
import type { Player, PlayerPhysical, PlayerSkills } from "./player.js";

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
  /** Équipe qui a actuellement la balle. */
  possession: TeamSide;
  onCourt: Record<TeamSide, OnCourtPlayer[]>; // 5 joueurs par équipe
  context: {
    homeTeamId: string;
    awayTeamId: string;
  };
}
