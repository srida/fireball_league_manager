import { describe, expect, it } from "vitest";
import { generateLeague } from "../generation/league.js";
import { generateSchedule } from "./schedule.js";

describe("generateSchedule — calendrier de saison (spec-tests-phase1 §1 Saison et playoffs)", () => {
  const league = generateLeague("schedule-test-league");
  const fixtures = generateSchedule(league);

  it("chaque équipe joue exactement 82 matchs", () => {
    const gamesPerTeam = new Map<string, number>();
    for (const f of fixtures) {
      gamesPerTeam.set(f.homeTeamId, (gamesPerTeam.get(f.homeTeamId) ?? 0) + 1);
      gamesPerTeam.set(f.awayTeamId, (gamesPerTeam.get(f.awayTeamId) ?? 0) + 1);
    }
    for (const team of league.teams) {
      expect(gamesPerTeam.get(team.id)).toBe(82);
    }
  });

  it("répartition domicile/extérieur exactement 41/41 par équipe", () => {
    const home = new Map<string, number>();
    const away = new Map<string, number>();
    for (const f of fixtures) {
      home.set(f.homeTeamId, (home.get(f.homeTeamId) ?? 0) + 1);
      away.set(f.awayTeamId, (away.get(f.awayTeamId) ?? 0) + 1);
    }
    for (const team of league.teams) {
      expect(home.get(team.id)).toBe(41);
      expect(away.get(team.id)).toBe(41);
    }
  });

  it("pondération correcte : division > conférence > hors-conférence (moyenne de matchs par adversaire)", () => {
    const countsVsFor = (teamId: string) => {
      const counts = new Map<string, number>();
      for (const f of fixtures) {
        if (f.homeTeamId === teamId) counts.set(f.awayTeamId, (counts.get(f.awayTeamId) ?? 0) + 1);
        if (f.awayTeamId === teamId) counts.set(f.homeTeamId, (counts.get(f.homeTeamId) ?? 0) + 1);
      }
      return counts;
    };

    for (const team of league.teams.slice(0, 6)) {
      const counts = countsVsFor(team.id);
      const divMates = league.teams.filter((t) => t.division === team.division && t.id !== team.id);
      const confMates = league.teams.filter((t) => t.conference === team.conference && t.division !== team.division);
      const others = league.teams.filter((t) => t.conference !== team.conference);

      const avg = (teams: typeof divMates) =>
        teams.reduce((sum, t) => sum + (counts.get(t.id) ?? 0), 0) / teams.length;

      const divAvg = avg(divMates);
      const confAvg = avg(confMates);
      const otherAvg = avg(others);

      expect(divAvg).toBeGreaterThan(confAvg);
      expect(confAvg).toBeGreaterThan(otherAvg);
    }
  });

  it("le nombre total de matchs correspond à 30 équipes × 82 / 2", () => {
    expect(fixtures.length).toBe((30 * 82) / 2);
  });
});
