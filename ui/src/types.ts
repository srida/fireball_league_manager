import type { League } from "../../engine/types/index.js";
import type { SeasonRunner, UpcomingGame } from "../../engine/season/seasonRunner.js";

export interface Franchise {
  league: League;
  userTeamId: string;
  runner: SeasonRunner;
  /** Nombre de cycles annuels déjà joués (0 à la création) — fait avancer `referenceDate` d'une intersaison à l'autre (P3 §Session 4). */
  seasonIndex: number;
}

export type Screen = "new-game" | "hub" | "live" | "tactics" | "scouting" | "intersaison";

export interface PendingGame {
  upcoming: UpcomingGame;
}
