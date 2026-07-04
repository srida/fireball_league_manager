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

describe("generateSchedule — calendrier à jours réels (plan-développement §Phase 2 — Session 4)", () => {
  const league = generateLeague("schedule-dates-test-league");
  const fixtures = generateSchedule(league);

  it("chaque match a une date ISO valide, jamais avant le début de saison", () => {
    for (const f of fixtures) {
      expect(f.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.date >= "2026-10-21").toBe(true);
    }
  });

  it("aucune équipe ne joue deux fois le même jour", () => {
    const byDate = new Map<string, Set<string>>();
    for (const f of fixtures) {
      const teamsToday = byDate.get(f.date) ?? new Set<string>();
      expect(teamsToday.has(f.homeTeamId)).toBe(false);
      expect(teamsToday.has(f.awayTeamId)).toBe(false);
      teamsToday.add(f.homeTeamId);
      teamsToday.add(f.awayTeamId);
      byDate.set(f.date, teamsToday);
    }
  });

  it("les dates sont non-décroissantes dans l'ordre du calendrier (chronologie cohérente)", () => {
    for (let i = 1; i < fixtures.length; i++) {
      expect(fixtures[i]!.date >= fixtures[i - 1]!.date).toBe(true);
    }
  });

  it("un taux de back-to-back réaliste émerge du calendrier (ni ~0 %, ni quasi-systématique)", () => {
    const lastPlayedDate = new Map<string, string>();
    let backToBackCount = 0;
    let totalTeamGames = 0;
    for (const f of fixtures) {
      for (const teamId of [f.homeTeamId, f.awayTeamId]) {
        totalTeamGames++;
        const previous = lastPlayedDate.get(teamId);
        if (previous) {
          const diffDays = Math.round(
            (Date.parse(`${f.date}T00:00:00.000Z`) - Date.parse(`${previous}T00:00:00.000Z`)) / 86_400_000,
          );
          if (diffDays === 1) backToBackCount++;
        }
        lastPlayedDate.set(teamId, f.date);
      }
    }
    const rate = backToBackCount / totalTeamGames;
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.4);
  });
});
