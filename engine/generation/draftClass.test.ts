import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { DRAFT_GENERATION } from "../config/tuning.js";
import { deriveAge } from "../players/age.js";
import { generateDraftClass, drawDraftClassQualityOffset } from "./draftClass.js";

const REFERENCE_DATE = "2027-10-01";

describe("generateDraftClass — spec-tests-phase1 §1 étendue (plan-développement §Phase 3 — Session 2)", () => {
  it("génère entre 60 et 70 prospects", () => {
    const rng = createRng("draft-class-size");
    for (let i = 0; i < 20; i++) {
      const prospects = generateDraftClass(rng, REFERENCE_DATE, 0);
      expect(prospects.length).toBeGreaterThanOrEqual(DRAFT_GENERATION.classSize.min);
      expect(prospects.length).toBeLessThanOrEqual(DRAFT_GENERATION.classSize.max);
    }
  });

  it("tous les prospects ont 18-22 ans à la date de référence", () => {
    const rng = createRng("draft-class-age");
    const prospects = generateDraftClass(rng, REFERENCE_DATE, 0);
    for (const prospect of prospects) {
      const age = deriveAge(prospect.birthDate, REFERENCE_DATE);
      expect(age).toBeGreaterThanOrEqual(DRAFT_GENERATION.ageRange.min - 1); // arrondi floor, cf. age.test.ts
      expect(age).toBeLessThanOrEqual(DRAFT_GENERATION.ageRange.max);
    }
  });

  it("les attributs techniques d'un prospect sont nettement plus faibles qu'un joueur confirmé du même archétype", () => {
    const rng = createRng("draft-class-weak-skills");
    const prospects = generateDraftClass(rng, REFERENCE_DATE, 0);
    const avgSkill =
      prospects.flatMap((p) => Object.values(p.skills)).reduce((a, b) => a + b, 0) /
      prospects.flatMap((p) => Object.values(p.skills)).length;
    // La génération standard tire des attributs moyens/forts couramment > 50-60 ;
    // le discount doit ramener la moyenne nettement en dessous.
    expect(avgSkill).toBeLessThan(45);
  });

  it("la qualité de cuvée décale la moyenne de potentiel de toute la classe", () => {
    const rngBad = createRng("draft-class-quality-a");
    const rngGood = createRng("draft-class-quality-b");
    const weakClass = generateDraftClass(rngBad, REFERENCE_DATE, -15);
    const strongClass = generateDraftClass(rngGood, REFERENCE_DATE, 15);

    const avgPotential = (players: typeof weakClass) =>
      players.reduce((sum, p) => sum + p.hidden.potential, 0) / players.length;

    expect(avgPotential(strongClass)).toBeGreaterThan(avgPotential(weakClass));
  });

  it("drawDraftClassQualityOffset reste borné et déterministe pour une seed donnée", () => {
    const a = drawDraftClassQualityOffset(createRng("quality-seed"));
    const b = drawDraftClassQualityOffset(createRng("quality-seed"));
    expect(a).toBe(b);
    expect(Math.abs(a)).toBeLessThanOrEqual(DRAFT_GENERATION.classQualityMax);
  });
});
