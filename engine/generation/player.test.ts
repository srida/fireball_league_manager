import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { generatePlayer } from "./player.js";
import { generateRoster } from "./roster.js";
import {
  ARCHETYPE_POSITIONS,
  PLAYER_GENERATION,
  TRAIT_EXCLUSIVE_PAIRS,
} from "../config/tuning.js";
import { POSITIONS, type ArchetypeId, type Position } from "../types/index.js";

const ARCHETYPE_IDS = Object.keys(ARCHETYPE_POSITIONS) as ArchetypeId[];

const FORBIDDEN_PLAYER_NAMES = [
  "LeBron James", "Michael Jordan", "Kobe Bryant", "Stephen Curry",
  "Kevin Durant", "Magic Johnson", "Larry Bird", "Shaquille O'Neal",
  "Tim Duncan", "Kareem Abdul-Jabbar",
];

describe("generatePlayer — cohérence physique (spec-tests-phase1 §1 Génération de la ligue)", () => {
  it("taille dans [175, 225], envergure ≥ taille et ≤ taille + 15", () => {
    const rng = createRng("physical-coherence");
    for (let i = 0; i < 300; i++) {
      const position = POSITIONS[i % POSITIONS.length] as Position;
      const archetypeId = rng.pick(
        ARCHETYPE_IDS.filter((a) => ARCHETYPE_POSITIONS[a].includes(position)),
      );
      const player = generatePlayer(rng, archetypeId, position);
      expect(player.heightCm).toBeGreaterThanOrEqual(PLAYER_GENERATION.heightCm.min);
      expect(player.heightCm).toBeLessThanOrEqual(PLAYER_GENERATION.heightCm.max);
      expect(player.wingspanCm).toBeGreaterThanOrEqual(player.heightCm);
      expect(player.wingspanCm).toBeLessThanOrEqual(player.heightCm + PLAYER_GENERATION.wingspanBonusCm.max);
    }
  });

  it("poids plausible vis-à-vis de la taille (IMC dans la fourchette athlète)", () => {
    const rng = createRng("bmi-coherence");
    for (let i = 0; i < 300; i++) {
      const position = POSITIONS[i % POSITIONS.length] as Position;
      const archetypeId = rng.pick(
        ARCHETYPE_IDS.filter((a) => ARCHETYPE_POSITIONS[a].includes(position)),
      );
      const player = generatePlayer(rng, archetypeId, position);
      // weightKg est arrondi à l'entier ; tolérance pour l'erreur d'arrondi
      // induite sur l'IMC recalculé (jusqu'à ±0.5 kg / height² en m²).
      const bmi = player.weightKg / (player.heightCm / 100) ** 2;
      expect(bmi).toBeGreaterThanOrEqual(PLAYER_GENERATION.bmi.min - 0.1);
      expect(bmi).toBeLessThanOrEqual(PLAYER_GENERATION.bmi.max + 0.1);
    }
  });

  it("distribution des tailles cohérente par poste : les C sont plus grands que les PG", () => {
    const rng = createRng("height-by-position");
    const sample = (position: Position) =>
      Array.from({ length: 100 }, () => {
        const archetypeId = rng.pick(
          ARCHETYPE_IDS.filter((a) => ARCHETYPE_POSITIONS[a].includes(position)),
        );
        return generatePlayer(rng, archetypeId, position).heightCm;
      });
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    const centersAvg = avg(sample("C"));
    const pointGuardsAvg = avg(sample("PG"));
    expect(centersAvg).toBeGreaterThan(pointGuardsAvg);
  });

  it("chaque joueur a un archétype valide compatible avec son poste", () => {
    const rng = createRng("archetype-validity");
    for (let i = 0; i < 200; i++) {
      const position = POSITIONS[i % POSITIONS.length] as Position;
      const validArchetypes = ARCHETYPE_IDS.filter((a) => ARCHETYPE_POSITIONS[a].includes(position));
      const archetypeId = rng.pick(validArchetypes);
      const player = generatePlayer(rng, archetypeId, position);
      expect(player.generation.archetypeId).toBe(archetypeId);
      expect(ARCHETYPE_POSITIONS[player.generation.archetypeId]).toContain(player.position);
    }
  });

  it("traits mentaux : jamais deux traits mutuellement exclusifs, maximum 3", () => {
    const rng = createRng("traits-exclusivity");
    for (let i = 0; i < 500; i++) {
      const position = POSITIONS[i % POSITIONS.length] as Position;
      const archetypeId = rng.pick(
        ARCHETYPE_IDS.filter((a) => ARCHETYPE_POSITIONS[a].includes(position)),
      );
      const player = generatePlayer(rng, archetypeId, position);
      const traits = player.mental.traits;
      expect(traits.length).toBeLessThanOrEqual(PLAYER_GENERATION.mentalTraits.max);
      for (const [a, b] of TRAIT_EXCLUSIVE_PAIRS) {
        expect(traits.includes(a) && traits.includes(b)).toBe(false);
      }
      expect(new Set(traits).size).toBe(traits.length);
    }
  });

  it("aucun nom réel de joueur NBA (garde-fou anonymisation)", () => {
    const rng = createRng("nba-player-name-guard");
    const roster = generateRoster(rng);
    for (const player of roster) {
      const fullName = `${player.firstName} ${player.lastName}`;
      expect(FORBIDDEN_PLAYER_NAMES).not.toContain(fullName);
    }
  });
});
