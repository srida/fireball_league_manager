/**
 * Tests de propriétés (famille 2, spec-tests-phase1.md §2, étendue à la Phase 3
 * — Session 1) : invariants qui doivent tenir pour n'importe quel joueur/seed,
 * sur des carrières simulées de bout en bout (progression + déclin + retraite).
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/utils/rng.js";
import { generatePlayer } from "../../engine/generation/player.js";
import { ARCHETYPE_POSITIONS, DEVELOPMENT } from "../../engine/config/tuning.js";
import { applyAnnualDevelopment, retirementProbability } from "../../engine/players/development.js";
import type { ArchetypeId } from "../../engine/types/index.js";

const ARCHETYPE_IDS = Object.keys(ARCHETYPE_POSITIONS) as ArchetypeId[];

describe("applyAnnualDevelopment — invariants sur 200 joueurs × 25 années simulées (plan P3 §Session 1)", () => {
  it("aucun attribut (technique ou physique) ne sort jamais de [0, 99]", () => {
    const rng = createRng("development-property-bounds");
    for (let i = 0; i < 200; i++) {
      const archetypeId = rng.pick(ARCHETYPE_IDS);
      const position = rng.pick(ARCHETYPE_POSITIONS[archetypeId]);
      const player = generatePlayer(rng, archetypeId, position);

      for (let age = 18; age < 43; age++) {
        const minutesShare = rng.float(0, 1);
        applyAnnualDevelopment(player, age, minutesShare);
        for (const value of Object.values(player.skills)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(99);
        }
        for (const value of Object.values(player.physical)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(99);
        }
      }
    }
  });

  it("un attribut déjà sous `potential` ne le dépasse jamais après une année de progression", () => {
    const rng = createRng("development-property-ceiling");
    for (let i = 0; i < 200; i++) {
      const archetypeId = rng.pick(ARCHETYPE_IDS);
      const position = rng.pick(ARCHETYPE_POSITIONS[archetypeId]);
      const player = generatePlayer(rng, archetypeId, position);
      const ceiling = player.hidden.potential;
      // Un archétype fort peut générer un attribut déjà au-dessus de `potential`
      // (tirages indépendants, spec §8) — l'invariant ne porte que sur les
      // attributs qui partaient réellement sous le plafond.
      const startedBelowCeiling = Object.entries(player.skills)
        .filter(([, value]) => value < ceiling)
        .map(([key]) => key as keyof typeof player.skills);

      applyAnnualDevelopment(player, 19, 1);

      for (const key of startedBelowCeiling) {
        expect(player.skills[key]).toBeLessThanOrEqual(ceiling + 0.001);
      }
    }
  });
});

describe("retirementProbability — monotonie en âge (plan P3 §Session 1)", () => {
  it("ne décroît jamais quand l'âge augmente, à joueur fixé, sur 100 joueurs aléatoires", () => {
    const rng = createRng("development-property-retirement-monotonic");
    for (let i = 0; i < 100; i++) {
      const archetypeId = rng.pick(ARCHETYPE_IDS);
      const position = rng.pick(ARCHETYPE_POSITIONS[archetypeId]);
      const player = generatePlayer(rng, archetypeId, position);

      let previous = 0;
      for (let age = 20; age <= DEVELOPMENT.retirement.hardRetireAge; age++) {
        const prob = retirementProbability(player, age);
        expect(prob).toBeGreaterThanOrEqual(previous - 1e-9);
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
        previous = prob;
      }
      expect(previous).toBe(1); // hardRetireAge atteint ⇒ probabilité 1
    }
  });
});
