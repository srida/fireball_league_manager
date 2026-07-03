import { describe, expect, it } from "vitest";
import { generateLeague } from "./league.js";
import { LEAGUE_GENERATION } from "../config/tuning.js";

describe("generateLeague — structure (spec-tests-phase1 §1 Génération de la ligue)", () => {
  it("génère exactement 30 équipes, 2 conférences, 6 divisions de 5", () => {
    const league = generateLeague("test-seed-1");

    expect(league.teams).toHaveLength(30);
    expect(league.conferences).toHaveLength(2);
    expect(league.divisions).toHaveLength(6);

    const byDivision = new Map<string, number>();
    for (const team of league.teams) {
      byDivision.set(team.division, (byDivision.get(team.division) ?? 0) + 1);
    }
    expect(byDivision.size).toBe(6);
    for (const count of byDivision.values()) {
      expect(count).toBe(5);
    }

    const byConference = new Map<string, number>();
    for (const team of league.teams) {
      byConference.set(team.conference, (byConference.get(team.conference) ?? 0) + 1);
    }
    expect(byConference.size).toBe(2);
    for (const count of byConference.values()) {
      expect(count).toBe(15);
    }
  });

  it("chaque équipe a un roster de 15 joueurs avec des numéros de maillot uniques", () => {
    const league = generateLeague("test-seed-2");

    for (const team of league.teams) {
      expect(team.roster).toHaveLength(LEAGUE_GENERATION.rosterSize);
      const numbers = team.roster.map((p) => p.jerseyNumber);
      expect(new Set(numbers).size).toBe(numbers.length);
      for (const n of numbers) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(99);
      }
    }
  });

  it("abréviations d'équipe uniques sur 3 lettres à travers la ligue", () => {
    const league = generateLeague("test-seed-3");
    const abbreviations = league.teams.map((t) => t.abbreviation);
    expect(new Set(abbreviations).size).toBe(abbreviations.length);
    for (const abbr of abbreviations) {
      expect(abbr).toHaveLength(3);
    }
  });

  it("même seed → même ligue (déterminisme)", () => {
    const a = generateLeague("determinisme-seed");
    const b = generateLeague("determinisme-seed");
    expect(a.teams.map((t) => t.name)).toEqual(b.teams.map((t) => t.name));
    expect(a.teams.map((t) => t.roster.map((p) => p.firstName + p.lastName))).toEqual(
      b.teams.map((t) => t.roster.map((p) => p.firstName + p.lastName)),
    );
  });

  it("deux seeds différentes → ligues différentes", () => {
    const a = generateLeague("seed-a");
    const b = generateLeague("seed-b");
    expect(a.teams.map((t) => t.name)).not.toEqual(b.teams.map((t) => t.name));
  });

  it("aucun nom d'équipe NBA réel (garde-fou anonymisation)", () => {
    const FORBIDDEN_NICKNAMES = [
      "Lakers", "Celtics", "Warriors", "Bulls", "Heat", "Knicks", "Nets",
      "Clippers", "Suns", "Mavericks", "Rockets", "Spurs", "Nuggets", "Jazz",
      "Grizzlies", "Pelicans", "Kings", "Trail Blazers", "Thunder", "Timberwolves",
      "Bucks", "Pacers", "Pistons", "Cavaliers", "Hawks", "Hornets", "Magic",
      "Wizards", "76ers", "Raptors",
    ];
    const league = generateLeague("nba-guard-seed");
    for (const team of league.teams) {
      for (const forbidden of FORBIDDEN_NICKNAMES) {
        expect(team.name).not.toContain(forbidden);
      }
    }
  });
});
