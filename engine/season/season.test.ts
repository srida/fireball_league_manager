import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { generateLeague } from "../generation/league.js";
import { simulateSeason } from "./season.js";

describe("simulateSeason — intégration de bout en bout (spec-tests-phase1 §1 Saison et playoffs)", () => {
  it("simule une saison complète : calendrier, classement, play-in, playoffs, un champion", () => {
    const league = generateLeague("season-integration-league");
    const rng = createRng("season-integration-sim");
    const season = simulateSeason(rng, league);

    expect(season.regularSeasonGames).toHaveLength((30 * 82) / 2);
    expect(season.standings).toHaveLength(30);
    expect(Object.keys(season.playIn)).toHaveLength(2);
    expect(Object.keys(season.conferenceBrackets)).toHaveLength(2);
    expect(typeof season.championTeamId).toBe("string");
    expect(league.teams.some((t) => t.id === season.championTeamId)).toBe(true);
  }, 30_000);

  it("déterminisme : même seed → même champion et mêmes classements", () => {
    const league = generateLeague("season-determinism-league");
    const seasonA = simulateSeason(createRng("season-determinism-sim"), league);
    const seasonB = simulateSeason(createRng("season-determinism-sim"), league);

    expect(seasonA.championTeamId).toBe(seasonB.championTeamId);
    expect(seasonA.standings.map((s) => s.teamId)).toEqual(seasonB.standings.map((s) => s.teamId));
  }, 30_000);
});
