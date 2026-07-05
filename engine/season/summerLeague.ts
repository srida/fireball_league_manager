/**
 * Summer League (plan-développement §Phase 3 — Session 4) : mini-tournoi
 * post-draft où rookies et jeunes joueurs (< `SUMMER_LEAGUE.eligibleSeasons`
 * saisons dans la ligue) jouent. Pas de simulation possession par possession —
 * un roster n'a souvent que 2-4 joueurs éligibles, insuffisant pour un vrai
 * 5x5 — une note de performance statistique en tient lieu (cf. tuning.ts).
 * Effets : micro-boost de progression + affinage du scouting de sa propre
 * équipe sur ses jeunes (spec : "affinage des fourchettes de scouting sur ses
 * propres jeunes").
 */
import { SUMMER_LEAGUE } from "../config/tuning.js";
import { applySummerLeagueBoost, playerOverallRating } from "../players/development.js";
import { scoutRosterPlayer, type ScoutingSnapshot } from "../market/scouting.js";
import type { RNG } from "../utils/rng.js";
import type { League, Player } from "../types/index.js";

/** Éligibilité Summer League : moins de `SUMMER_LEAGUE.eligibleSeasons` saisons dans la ligue. */
export function isSummerLeagueEligible(player: Player): boolean {
  return player.state.seasonsInLeague < SUMMER_LEAGUE.eligibleSeasons;
}

export interface SummerLeaguePlayerResult {
  playerId: string;
  teamId: string;
  /** Note de performance statistique (0-99), informative — pas une vraie stat de match. */
  performanceGrade: number;
  /** Fourchettes affinées par le scouting de sa propre équipe (spec : "affinage... sur ses propres jeunes"). */
  refinedReport: ScoutingSnapshot;
}

export interface SummerLeagueResult {
  participants: SummerLeaguePlayerResult[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Joue la Summer League pour toute la ligue : chaque joueur éligible (rookies
 * draftés inclus, cf. `applyDraftToRosters` doit avoir tourné avant) reçoit une
 * note de performance, un micro-boost de progression, et un rapport de
 * scouting affiné par sa propre équipe (investissement bonifié — "on l'a vu
 * jouer en vrai"). Mutation directe des `Player` (même convention que
 * `runOffseason`/`applyAnnualDevelopment`).
 */
export function runSummerLeague(rng: RNG, league: League): SummerLeagueResult {
  const participants: SummerLeaguePlayerResult[] = [];

  for (const team of league.teams) {
    const eligiblePlayers = team.roster.filter(isSummerLeagueEligible);
    for (const player of eligiblePlayers) {
      const performanceGrade = clamp(
        rng.gaussian(playerOverallRating(player), SUMMER_LEAGUE.performanceStdDev, 0, 99),
        0,
        99,
      );

      applySummerLeagueBoost(player);

      const investment = team.scoutingQuality + SUMMER_LEAGUE.scoutingInvestmentBonus;
      const refinedReport = scoutRosterPlayer(rng, player, team, investment);

      participants.push({ playerId: player.id, teamId: team.id, performanceGrade, refinedReport });
    }
  }

  return { participants };
}
