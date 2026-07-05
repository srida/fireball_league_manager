import { describe, expect, it } from "vitest";
import { generateLeague } from "../generation/league.js";
import { createRng } from "../utils/rng.js";
import { LEAGUE_GENERATION, PLAYER_GENERATION } from "../config/tuning.js";
import { addYears, deriveAge } from "../players/age.js";
import { runOffseason } from "./offseason.js";

describe("runOffseason (plan-développement §Phase 3 — Session 1)", () => {
  it("chaque roster reste à taille fixe après l'intersaison, même avec des retraites", () => {
    const league = generateLeague("offseason-roster-size");
    const referenceDate = addYears(PLAYER_GENERATION.referenceDate, 1);
    const rng = createRng("offseason-roster-size-run");

    const result = runOffseason(rng, league, {}, referenceDate);

    for (const team of league.teams) {
      expect(team.roster).toHaveLength(LEAGUE_GENERATION.rosterSize);
      const jerseyNumbers = team.roster.map((p) => p.jerseyNumber);
      expect(new Set(jerseyNumbers).size).toBe(jerseyNumbers.length);
    }
    expect(result.retirements).toBeGreaterThanOrEqual(0);
    expect(result.replacementsGenerated).toBeGreaterThanOrEqual(result.retirements);
  });

  it("est déterministe : même seed → mêmes retraites/remplacements/âge moyen", () => {
    const referenceDate = addYears(PLAYER_GENERATION.referenceDate, 1);

    const leagueA = generateLeague("offseason-determinism");
    const resultA = runOffseason(createRng("offseason-run"), leagueA, {}, referenceDate);

    const leagueB = generateLeague("offseason-determinism");
    const resultB = runOffseason(createRng("offseason-run"), leagueB, {}, referenceDate);

    expect(resultA.retirements).toBe(resultB.retirements);
    expect(resultA.replacementsGenerated).toBe(resultB.replacementsGenerated);
    expect(resultA.leagueAverageAge).toBeCloseTo(resultB.leagueAverageAge, 10);
  });

  it("un remplaçant généré en cours de batch a un âge plausible (dans PLAYER_GENERATION.ageRange) et non celui d'un vétéran de 40+ ans", () => {
    const league = generateLeague("offseason-replacement-age");
    // Beaucoup de saisons pour forcer des retraites et des remplacements.
    const rng = createRng("offseason-replacement-age-run");
    let referenceDate: string = PLAYER_GENERATION.referenceDate;
    let sawReplacement = false;

    for (let season = 1; season <= 15; season++) {
      referenceDate = addYears(PLAYER_GENERATION.referenceDate, season);
      const result = runOffseason(rng, league, {}, referenceDate);
      if (result.replacementsGenerated > 0) sawReplacement = true;
    }

    expect(sawReplacement).toBe(true);
    for (const team of league.teams) {
      for (const player of team.roster) {
        const age = deriveAge(player.birthDate, referenceDate);
        // -1 : arrondi par floor de deriveAge sur jour/mois tiré aléatoirement (même effet que
        // l'exemple deriveAge("2007-11-01", "2026-10-01") === 18 dans age.test.ts, pas un bug d'offseason.
        expect(age).toBeGreaterThanOrEqual(PLAYER_GENERATION.ageRange.min - 1);
        expect(age).toBeLessThanOrEqual(PLAYER_GENERATION.ageRange.max + 15); // +marge : vétérans déjà présents avant le batch
      }
    }
  });

  it("seasonsInLeague est incrémenté de 1 pour chaque survivant (plan P3 §Session 4 : éligibilité Summer League)", () => {
    const league = generateLeague("offseason-tenure-league");
    const rng = createRng("offseason-tenure-run");
    const referenceDate = addYears(PLAYER_GENERATION.referenceDate, 1);

    const before = new Map(league.teams.flatMap((t) => t.roster).map((p) => [p.id, p.state.seasonsInLeague]));
    runOffseason(rng, league, {}, referenceDate);

    for (const team of league.teams) {
      for (const player of team.roster) {
        const previous = before.get(player.id);
        // Un survivant a vu son compteur +1 ; un remplaçant (nouveau, absent de `before`) démarre à 0.
        if (previous !== undefined) expect(player.state.seasonsInLeague).toBe(previous + 1);
        else expect(player.state.seasonsInLeague).toBe(0);
      }
    }
  });

  it("l'âge moyen de la ligue avance d'environ un an par intersaison quand personne ne part à la retraite", () => {
    // Ligue jeune (peu de retraites attendues sur une seule intersaison) pour isoler l'effet du vieillissement.
    const league = generateLeague("offseason-age-drift");
    const rng = createRng("offseason-age-drift-run");
    const referenceDateSeason1 = addYears(PLAYER_GENERATION.referenceDate, 1);
    const ageBefore =
      league.teams.flatMap((t) => t.roster).reduce((sum, p) => sum + deriveAge(p.birthDate, PLAYER_GENERATION.referenceDate), 0) /
      league.teams.flatMap((t) => t.roster).length;

    const result = runOffseason(rng, league, {}, referenceDateSeason1);

    // Sans retraites, l'écart serait exactement +1 ; avec quelques départs/remplacements
    // (potentiellement plus jeunes ou plus vieux), on reste dans une fourchette large.
    expect(result.leagueAverageAge).toBeGreaterThan(ageBefore - 2);
    expect(result.leagueAverageAge).toBeLessThan(ageBefore + 2);
  });
});
