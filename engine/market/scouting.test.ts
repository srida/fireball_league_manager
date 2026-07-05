import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { generateLeague } from "../generation/league.js";
import { generateDraftClass } from "../generation/draftClass.js";
import { SKILL_KEYS } from "../generation/player.js";
import { SCOUTING } from "../config/tuning.js";
import { scoutDraftClassForLeague, scoutDraftClassForTeam } from "./scouting.js";

const REFERENCE_DATE = "2027-10-01";

describe("scoutDraftClassForTeam — fourchettes, jamais la vraie valeur (plan-développement §Phase 3 — Session 3)", () => {
  it("produit un rapport pour chaque prospect, avec des fourchettes finales valides (min <= max, dans [0,99])", () => {
    const rng = createRng("scouting-basic");
    const league = generateLeague("scouting-basic-league");
    const prospects = generateDraftClass(rng, REFERENCE_DATE, 0);
    const reports = scoutDraftClassForTeam(rng, prospects, league.teams[0]!);

    expect(reports.size).toBe(prospects.length);
    for (const prospect of prospects) {
      const report = reports.get(prospect.id);
      expect(report).toBeDefined();
      for (const key of SKILL_KEYS) {
        const range = report!.final.skills[key];
        expect(range.min).toBeLessThanOrEqual(range.max);
        expect(range.min).toBeGreaterThanOrEqual(0);
        expect(range.max).toBeLessThanOrEqual(99);
      }
      expect(report!.final.potential.min).toBeLessThanOrEqual(report!.final.potential.max);
    }
  });

  it("le rapport mi-saison a des fourchettes en moyenne plus larges que le rapport final", () => {
    const rng = createRng("scouting-midseason-width");
    const league = generateLeague("scouting-midseason-league");
    const prospects = generateDraftClass(rng, REFERENCE_DATE, 0);
    const reports = scoutDraftClassForTeam(rng, prospects, league.teams[0]!);

    let midSeasonWiderCount = 0;
    for (const report of reports.values()) {
      const midWidth =
        SKILL_KEYS.reduce((sum, key) => sum + (report.midSeason.skills[key].max - report.midSeason.skills[key].min), 0) /
        SKILL_KEYS.length;
      const finalWidth =
        SKILL_KEYS.reduce((sum, key) => sum + (report.final.skills[key].max - report.final.skills[key].min), 0) / SKILL_KEYS.length;
      if (midWidth >= finalWidth) midSeasonWiderCount++;
    }
    // Tirages de bruit indépendants → pas garanti à 100% par prospect, mais l'immense majorité doit se resserrer.
    expect(midSeasonWiderCount / reports.size).toBeGreaterThan(0.8);
  });

  it("est déterministe pour une seed donnée", () => {
    const league = generateLeague("scouting-determinism-league");
    const prospectsA = generateDraftClass(createRng("scouting-determinism"), REFERENCE_DATE, 0);
    const reportsA = scoutDraftClassForTeam(createRng("scouting-determinism-reports"), prospectsA, league.teams[0]!);
    const prospectsB = generateDraftClass(createRng("scouting-determinism"), REFERENCE_DATE, 0);
    const reportsB = scoutDraftClassForTeam(createRng("scouting-determinism-reports"), prospectsB, league.teams[0]!);

    for (const prospect of prospectsA) {
      expect(reportsA.get(prospect.id)!.final.apparentValue).toBe(reportsB.get(prospect.id)!.final.apparentValue);
    }
  });

  it("deux équipes de qualité de scouting différente perçoivent le même prospect différemment", () => {
    const league = generateLeague("scouting-team-variance-league");
    const rng = createRng("scouting-team-variance");
    const prospects = generateDraftClass(rng, REFERENCE_DATE, 0);

    const teamA = { ...league.teams[0]!, scoutingQuality: 0.95, scoutingBias: 0 };
    const teamB = { ...league.teams[1]!, scoutingQuality: 0.15, scoutingBias: 0 };

    const reportsA = scoutDraftClassForTeam(createRng("scouting-variance-a"), prospects, teamA);
    const reportsB = scoutDraftClassForTeam(createRng("scouting-variance-b"), prospects, teamB);

    const widthA =
      [...reportsA.values()].reduce(
        (sum, r) => sum + SKILL_KEYS.reduce((s, key) => s + (r.final.skills[key].max - r.final.skills[key].min), 0) / SKILL_KEYS.length,
        0,
      ) / reportsA.size;
    const widthB =
      [...reportsB.values()].reduce(
        (sum, r) => sum + SKILL_KEYS.reduce((s, key) => s + (r.final.skills[key].max - r.final.skills[key].min), 0) / SKILL_KEYS.length,
        0,
      ) / reportsB.size;

    expect(widthA).toBeLessThan(widthB);
  });

  it("le biais d'évaluation d'une équipe déplace sa valeur apparente sans changer les fourchettes affichées", () => {
    const league = generateLeague("scouting-bias-league");
    const rng = createRng("scouting-bias-rng");
    const prospects = generateDraftClass(rng, REFERENCE_DATE, 0);

    const optimistic = { ...league.teams[0]!, scoutingQuality: 0.7, scoutingBias: 12 };
    const pessimistic = { ...league.teams[0]!, scoutingQuality: 0.7, scoutingBias: -12 };

    const reportsOptimistic = scoutDraftClassForTeam(createRng("scouting-bias-shared"), prospects, optimistic);
    const reportsPessimistic = scoutDraftClassForTeam(createRng("scouting-bias-shared"), prospects, pessimistic);

    const avgOptimistic = [...reportsOptimistic.values()].reduce((s, r) => s + r.final.apparentValue, 0) / reportsOptimistic.size;
    const avgPessimistic = [...reportsPessimistic.values()].reduce((s, r) => s + r.final.apparentValue, 0) / reportsPessimistic.size;

    expect(avgOptimistic).toBeGreaterThan(avgPessimistic);
  });

  it("les attributs cachés (trueComposure, traits) ne sont révélés qu'à investissement maximal", () => {
    const league = generateLeague("scouting-hidden-league");
    const rng = createRng("scouting-hidden-rng");
    const prospects = generateDraftClass(rng, REFERENCE_DATE, 0);

    const lowBudgetTeam = { ...league.teams[0]!, scoutingQuality: 0.2, scoutingBias: 0 };
    const maxBudgetTeam = { ...league.teams[0]!, scoutingQuality: 1, scoutingBias: 0 };

    const lowReports = scoutDraftClassForTeam(createRng("scouting-hidden-low"), prospects, lowBudgetTeam);
    const maxReports = scoutDraftClassForTeam(createRng("scouting-hidden-max"), prospects, maxBudgetTeam);

    for (const report of lowReports.values()) {
      if (report.investment < SCOUTING.hiddenRevealThreshold) expect(report.hidden).toBeUndefined();
    }
    const someRevealedAtMax = [...maxReports.values()].some((r) => r.hidden !== undefined);
    expect(someRevealedAtMax).toBe(true);
  });
});

describe("scoutDraftClassForLeague — une carte de rapports par équipe", () => {
  it("retourne une entrée pour chacune des 30 équipes", () => {
    const league = generateLeague("scouting-league-map");
    const rng = createRng("scouting-league-map-rng");
    const prospects = generateDraftClass(rng, REFERENCE_DATE, 0);
    const reportsByTeam = scoutDraftClassForLeague(rng, prospects, league.teams);

    expect(reportsByTeam.size).toBe(30);
    for (const team of league.teams) {
      expect(reportsByTeam.get(team.id)?.size).toBe(prospects.length);
    }
  });
});
