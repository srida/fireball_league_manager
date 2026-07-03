/**
 * Tests de propriétés (spec-tests-phase1.md §2, plan-développement §Phase 2 —
 * Session 3) : `pressureModifier` et `computeVarianceFactor` doivent rester
 * dans leurs bornes documentées quels que soient les tirages/traits/contexte.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/utils/rng.js";
import { PRESSURE, pressureModifier } from "../../engine/config/tuning.js";
import { applyVarianceToSkills, computeVarianceFactor } from "../../engine/simulation/mental.js";
import { makeFive } from "../../engine/simulation/testUtils.js";
import type { GameTier, PlayerSkills, PressureContext, Trait } from "../../engine/types/index.js";

const GAME_TIERS: readonly GameTier[] = ["REGULAR_SEASON", "PLAY_IN", "PLAYOFFS", "FINALS"];
const ALL_TRAIT_COMBOS: readonly Trait[][] = [
  [],
  ["clutchKiller"],
  ["bigGameChoker"],
  ["playoffPerformer"],
  ["clutchKiller", "playoffPerformer"],
  ["bigGameChoker", "playoffPerformer"],
];

const SAMPLE_SIZE = 2000;

describe(`pressureModifier — bornes sur ${SAMPLE_SIZE} tirages (spec-player-model §7)`, () => {
  it("reste toujours dans [PRESSURE.minModifier, PRESSURE.maxModifier]", () => {
    const rng = createRng("pressure-modifier-fuzz");
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const trueComposure = rng.int(0, 99);
      const pressureScore = rng.int(0, 100);
      const isClutchTime = rng.bool();
      const gameTier = GAME_TIERS[rng.int(0, GAME_TIERS.length - 1)]!;
      const traits = ALL_TRAIT_COMBOS[rng.int(0, ALL_TRAIT_COMBOS.length - 1)]!;
      const context: PressureContext = { pressureScore, isClutchTime, gameTier };

      const mod = pressureModifier(trueComposure, traits, context);
      expect(mod).toBeGreaterThanOrEqual(PRESSURE.minModifier);
      expect(mod).toBeLessThanOrEqual(PRESSURE.maxModifier);
      expect(Number.isFinite(mod)).toBe(true);
    }
  });

  it("pressureScore = 0, hors clutch time et sans playoffPerformer → toujours identité, quelle que soit la composure", () => {
    // clutchKiller/bigGameChoker sont conditionnés à isClutchTime (jamais actif ici) ;
    // playoffPerformer, en revanche, dépend du gameTier seul (spec §4.2 "bonus global
    // en playoffs, léger malus en saison régulière"), pas du pressureScore — testé séparément ci-dessous.
    const rng = createRng("pressure-modifier-zero-fuzz");
    const neutral: PressureContext = { pressureScore: 0, isClutchTime: false, gameTier: "REGULAR_SEASON" };
    const traitsWithoutPlayoffPerformer = ALL_TRAIT_COMBOS.filter((t) => !t.includes("playoffPerformer"));
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const trueComposure = rng.int(0, 99);
      const traits = traitsWithoutPlayoffPerformer[rng.int(0, traitsWithoutPlayoffPerformer.length - 1)]!;
      expect(pressureModifier(trueComposure, traits, neutral)).toBe(1);
    }
  });

  it("playoffPerformer applique son bonus/malus même à pressureScore = 0 (dépend du gameTier, pas de la pression)", () => {
    const neutralRegular: PressureContext = { pressureScore: 0, isClutchTime: false, gameTier: "REGULAR_SEASON" };
    const neutralPlayoffs: PressureContext = { pressureScore: 0, isClutchTime: false, gameTier: "PLAYOFFS" };
    expect(pressureModifier(55, ["playoffPerformer"], neutralRegular)).toBeLessThan(1);
    expect(pressureModifier(55, ["playoffPerformer"], neutralPlayoffs)).toBeGreaterThan(1);
  });
});

describe(`computeVarianceFactor / applyVarianceToSkills — bornes sur ${SAMPLE_SIZE} tirages (spec §4.2)`, () => {
  it("le facteur de variance reste dans [MENTAL.varianceFactorMin, MENTAL.varianceFactorMax]", () => {
    const metronomeBase = makeFive("mental-prop-metronome")[0]!;
    const erraticBase = makeFive("mental-prop-erratic")[0]!;
    const metronome = { ...metronomeBase, mental: { ...metronomeBase.mental, traits: ["metronome" as const] } };
    const erratic = { ...erraticBase, mental: { ...erraticBase.mental, traits: ["erratic" as const] } };
    const rng = createRng("variance-fuzz");

    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const mFactor = computeVarianceFactor(metronome, rng);
      const eFactor = computeVarianceFactor(erratic, rng);
      expect(mFactor).toBeGreaterThanOrEqual(0.7);
      expect(mFactor).toBeLessThanOrEqual(1.3);
      expect(eFactor).toBeGreaterThanOrEqual(0.7);
      expect(eFactor).toBeLessThanOrEqual(1.3);
    }
  });

  it("applyVarianceToSkills conserve toujours des attributs dans [0, 99]", () => {
    const player = makeFive("variance-apply-prop")[0]!;
    const factors = [0.7, 0.85, 1, 1.15, 1.3];
    for (const factor of factors) {
      const scaled = applyVarianceToSkills(player.skills, factor);
      for (const key of Object.keys(player.skills) as (keyof PlayerSkills)[]) {
        expect(scaled[key]).toBeGreaterThanOrEqual(0);
        expect(scaled[key]).toBeLessThanOrEqual(99);
      }
    }
  });
});
