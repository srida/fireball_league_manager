/** Poste sur le terrain. */
export type Position = "PG" | "SG" | "SF" | "PF" | "C";

export const POSITIONS: readonly Position[] = ["PG", "SG", "SF", "PF", "C"];

export type Handedness = "right" | "left";

/** Camp d'un match : domicile / extérieur (spec possession §1, GameState). */
export type TeamSide = "HOME" | "AWAY";
