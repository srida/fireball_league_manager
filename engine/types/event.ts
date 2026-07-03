/**
 * Log d'événements — source de vérité (spec-possession-algorithm.md §9).
 * Box score et stats avancées sont dérivés de ce log, jamais calculés à part
 * (CLAUDE.md — principe "Simulation événementielle").
 *
 * Les champs `player`/`on`/`assistBy`/`stealBy`/`in`/`out` référencent des Player.id.
 */

export type ShotType = "RIM" | "MID_RANGE" | "THREE";

export type ShotResult = "MAKE" | "MISS" | "BLOCK";

export type ContestLevel = "OPEN" | "CONTESTED" | "HEAVILY_CONTESTED";

export type ReboundSide = "OFF" | "DEF";

export type TurnoverCause = "STEAL" | "BAD_PASS" | "HANDLE" | "OFFENSIVE_FOUL";

export type FoulType = "SHOOTING" | "PERSONAL" | "OFFENSIVE";

export type Event =
  | {
      t: "SHOT";
      player: string;
      shotType: ShotType;
      result: ShotResult;
      contest: ContestLevel;
      assistBy?: string;
      /** Défenseur ayant contré le tir — présent seulement si `result === "BLOCK"`. */
      blockedBy?: string;
      clock: number;
    }
  | { t: "REBOUND"; player: string; side: ReboundSide; clock: number }
  | {
      t: "TURNOVER";
      player: string;
      cause: TurnoverCause;
      stealBy?: string;
      clock: number;
    }
  | { t: "FOUL"; player: string; on: string; type: FoulType; clock: number }
  | {
      t: "FREE_THROW";
      player: string;
      result: "MAKE" | "MISS";
      index: number;
      total: number;
      clock: number;
    }
  | { t: "SUB"; in: string; out: string; clock: number }; // P2
