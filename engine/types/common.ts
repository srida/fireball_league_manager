/** Poste sur le terrain. */
export type Position = "PG" | "SG" | "SF" | "PF" | "C";

export const POSITIONS: readonly Position[] = ["PG", "SG", "SF", "PF", "C"];

export type Handedness = "right" | "left";

/** Camp d'un match : domicile / extérieur (spec possession §1, GameState). */
export type TeamSide = "HOME" | "AWAY";

/** Type de match (plan-développement §Phase 2 — Session 3, spec-player-model §7 "base(typeMatch)"). */
export type GameTier = "REGULAR_SEASON" | "PLAY_IN" | "PLAYOFFS" | "FINALS";

/** Enjeu d'un match, déterminé par l'appelant (season.ts/playoffs.ts) avant simulation. */
export interface GameContextInfo {
  gameTier: GameTier;
  /** Une défaite ce soir élimine au moins une des deux équipes (spec §7 "eliminationStake"). */
  isEliminationGame: boolean;
  /** Match décisif d'une série au meilleur des 7 (3-3). */
  isGame7: boolean;
}

/** Contexte de pression calculé par possession (spec-player-model §7), consommé par `pressureModifier`. */
export interface PressureContext {
  pressureScore: number; // 0-100
  isClutchTime: boolean; // écart ≤ 5 pts ET ≤ 5 min au Q4/OT (définition littérale spec §7)
  gameTier: GameTier;
}
