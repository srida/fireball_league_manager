import type { League } from "../../engine/types/index.js";
import type { SeasonRunner, UpcomingGame } from "../../engine/season/seasonRunner.js";

export interface Franchise {
  league: League;
  userTeamId: string;
  runner: SeasonRunner;
}

export type Screen = "new-game" | "hub" | "live" | "tactics";

export interface PendingGame {
  upcoming: UpcomingGame;
}
