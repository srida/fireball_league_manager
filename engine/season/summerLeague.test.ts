import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { generateLeague } from "../generation/league.js";
import { SUMMER_LEAGUE } from "../config/tuning.js";
import { isSummerLeagueEligible, runSummerLeague } from "./summerLeague.js";

describe("isSummerLeagueEligible (plan-développement §Phase 3 — Session 4)", () => {
  it("éligible sous le seuil, inéligible au-delà", () => {
    const league = generateLeague("summer-league-eligibility");
    const player = league.teams[0]!.roster[0]!;

    player.state.seasonsInLeague = 0;
    expect(isSummerLeagueEligible(player)).toBe(true);
    player.state.seasonsInLeague = SUMMER_LEAGUE.eligibleSeasons - 1;
    expect(isSummerLeagueEligible(player)).toBe(true);
    player.state.seasonsInLeague = SUMMER_LEAGUE.eligibleSeasons;
    expect(isSummerLeagueEligible(player)).toBe(false);
  });
});

describe("runSummerLeague (plan-développement §Phase 3 — Session 4)", () => {
  it("ne traite que les joueurs éligibles de chaque équipe", () => {
    const league = generateLeague("summer-league-participants");
    // Force une composition connue : 2 rookies (0 saison), le reste vétérans (10 saisons).
    for (const team of league.teams) {
      team.roster.forEach((p, i) => {
        p.state.seasonsInLeague = i < 2 ? 0 : 10;
      });
    }
    const rng = createRng("summer-league-participants-run");

    const result = runSummerLeague(rng, league);

    expect(result.participants).toHaveLength(league.teams.length * 2);
    for (const participant of result.participants) {
      expect(participant.performanceGrade).toBeGreaterThanOrEqual(0);
      expect(participant.performanceGrade).toBeLessThanOrEqual(99);
    }
  });

  it("applique un micro-boost de progression aux participants (skills techniques ne diminuent jamais)", () => {
    const league = generateLeague("summer-league-boost");
    for (const team of league.teams) {
      team.roster.forEach((p, i) => {
        p.state.seasonsInLeague = i === 0 ? 0 : 10;
      });
    }
    const rng = createRng("summer-league-boost-run");
    const rookie = league.teams[0]!.roster[0]!;
    const skillsBefore = { ...rookie.skills };

    runSummerLeague(rng, league);

    for (const key of Object.keys(skillsBefore) as (keyof typeof skillsBefore)[]) {
      expect(rookie.skills[key]).toBeGreaterThanOrEqual(skillsBefore[key]);
    }
  });

  it("est déterministe pour une seed donnée", () => {
    const leagueA = generateLeague("summer-league-determinism");
    const leagueB = generateLeague("summer-league-determinism");
    for (const league of [leagueA, leagueB]) {
      for (const team of league.teams) team.roster.forEach((p, i) => (p.state.seasonsInLeague = i < 3 ? 0 : 10));
    }

    const resultA = runSummerLeague(createRng("summer-league-determinism-run"), leagueA);
    const resultB = runSummerLeague(createRng("summer-league-determinism-run"), leagueB);

    expect(resultA.participants.map((p) => p.performanceGrade)).toEqual(resultB.participants.map((p) => p.performanceGrade));
  });

  it("aucun participant si aucun joueur n'est éligible", () => {
    const league = generateLeague("summer-league-none-eligible");
    for (const team of league.teams) {
      for (const player of team.roster) player.state.seasonsInLeague = 10;
    }
    const result = runSummerLeague(createRng("summer-league-none-eligible-run"), league);
    expect(result.participants).toHaveLength(0);
  });
});
