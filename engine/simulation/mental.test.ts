import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { MENTAL, PRESSURE, gameStaminaFactor, pressureModifier } from "../config/tuning.js";
import {
  applyLeadershipBuffer,
  applyVarianceToSkills,
  computePressureContext,
  computeVarianceFactor,
  disciplineOffensiveFoulWeight,
  effectiveGameStaminaFactor,
  effectiveInjuryGamesOut,
  teamLeadershipBufferStrength,
} from "./mental.js";
import { makeFive, makeGameState } from "./testUtils.js";
import type { GameState, Player, PressureContext, Trait } from "../types/index.js";

function withMental(player: Player, mental: Partial<Player["mental"]>): Player {
  return { ...player, mental: { ...player.mental, ...mental } };
}

function withTraits(player: Player, traits: Trait[]): Player {
  return withMental(player, { traits });
}

function contextWith(state: GameState, overrides: Partial<GameState["context"]>): GameState {
  return { ...state, context: { ...state.context, ...overrides } };
}

describe("computePressureContext (spec-player-model.md §7, plan P2 §Session 3)", () => {
  it("base par gameTier seule, sans clutch/élimination/game 7", () => {
    const home = makeFive("pressure-ctx-home");
    const away = makeFive("pressure-ctx-away");
    const state = makeGameState(home, away, { quarter: 1, clockSeconds: 720 });

    for (const gameTier of ["REGULAR_SEASON", "PLAY_IN", "PLAYOFFS", "FINALS"] as const) {
      const ctx = computePressureContext(contextWith(state, { gameTier }));
      expect(ctx.pressureScore).toBe(PRESSURE.baseByGameTier[gameTier]);
      expect(ctx.isClutchTime).toBe(false);
    }
  });

  it("clutch time détecté uniquement au Q4+/OT avec horloge et écart de score sous les seuils", () => {
    const home = makeFive("pressure-clutch-home");
    const away = makeFive("pressure-clutch-away");

    const clutchState = makeGameState(home, away, {
      quarter: 4,
      clockSeconds: 100,
      game: { id: "g", homeTeamId: "home", awayTeamId: "away", status: "IN_PROGRESS", homeScore: 90, awayScore: 88, quarter: 4, events: [] },
    });
    const ctx = computePressureContext(clutchState);
    expect(ctx.isClutchTime).toBe(true);
    expect(ctx.pressureScore).toBe(PRESSURE.baseByGameTier.REGULAR_SEASON + PRESSURE.clutchTimeBonus);

    const notLateEnough = makeGameState(home, away, {
      quarter: 3,
      clockSeconds: 100,
      game: { id: "g", homeTeamId: "home", awayTeamId: "away", status: "IN_PROGRESS", homeScore: 90, awayScore: 88, quarter: 3, events: [] },
    });
    expect(computePressureContext(notLateEnough).isClutchTime).toBe(false);

    const tooFarApart = makeGameState(home, away, {
      quarter: 4,
      clockSeconds: 100,
      game: { id: "g", homeTeamId: "home", awayTeamId: "away", status: "IN_PROGRESS", homeScore: 100, awayScore: 80, quarter: 4, events: [] },
    });
    expect(computePressureContext(tooFarApart).isClutchTime).toBe(false);
  });

  it("bonus élimination et game 7 s'additionnent, plafonné à 100", () => {
    const home = makeFive("pressure-elim-home");
    const away = makeFive("pressure-elim-away");
    const state = makeGameState(home, away, { quarter: 1, clockSeconds: 720 });

    const elimination = computePressureContext(contextWith(state, { gameTier: "PLAYOFFS", isEliminationGame: true }));
    expect(elimination.pressureScore).toBe(PRESSURE.baseByGameTier.PLAYOFFS + PRESSURE.eliminationBonus);

    const finalsGame7 = computePressureContext(
      contextWith(state, { gameTier: "FINALS", isEliminationGame: true, isGame7: true }),
    );
    expect(finalsGame7.pressureScore).toBeLessThanOrEqual(100);
  });
});

describe("pressureModifier (spec-player-model.md §7, plan P2 §Session 3)", () => {
  const neutralContext: PressureContext = { pressureScore: 0, isClutchTime: false, gameTier: "REGULAR_SEASON" };

  it("aucun effet à pressureScore = 0", () => {
    expect(pressureModifier(20, [], neutralContext)).toBe(1);
    expect(pressureModifier(95, [], neutralContext)).toBe(1);
  });

  it("composure faible + pression élevée → malus, borné par PRESSURE.maxModifier/minModifier", () => {
    const context: PressureContext = { pressureScore: 100, isClutchTime: false, gameTier: "PLAYOFFS" };
    const mod = pressureModifier(0, [], context);
    expect(mod).toBeLessThan(1);
    expect(mod).toBeGreaterThanOrEqual(PRESSURE.minModifier);
  });

  it("composure élevée + pression élevée → léger boost, jamais au-delà de maxModifier", () => {
    const context: PressureContext = { pressureScore: 100, isClutchTime: false, gameTier: "PLAYOFFS" };
    const mod = pressureModifier(99, [], context);
    expect(mod).toBeGreaterThan(1);
    expect(mod).toBeLessThanOrEqual(PRESSURE.maxModifier);
  });

  it("clutchKiller booste en money time, bigGameChoker pénalise — inactifs hors clutch time", () => {
    const clutch: PressureContext = { pressureScore: 50, isClutchTime: true, gameTier: "REGULAR_SEASON" };
    const notClutch: PressureContext = { pressureScore: 50, isClutchTime: false, gameTier: "REGULAR_SEASON" };

    const killerClutch = pressureModifier(55, ["clutchKiller"], clutch);
    const killerNoClutch = pressureModifier(55, ["clutchKiller"], notClutch);
    expect(killerClutch).toBeGreaterThan(killerNoClutch);

    const chokerClutch = pressureModifier(55, ["bigGameChoker"], clutch);
    const chokerNoClutch = pressureModifier(55, ["bigGameChoker"], notClutch);
    expect(chokerClutch).toBeLessThan(chokerNoClutch);
  });

  it("playoffPerformer : bonus hors saison régulière, léger malus en saison régulière", () => {
    const regular: PressureContext = { pressureScore: 10, isClutchTime: false, gameTier: "REGULAR_SEASON" };
    const playoffs: PressureContext = { pressureScore: 50, isClutchTime: false, gameTier: "PLAYOFFS" };

    const baseRegular = pressureModifier(55, [], regular);
    const withTraitRegular = pressureModifier(55, ["playoffPerformer"], regular);
    expect(withTraitRegular).toBeLessThan(baseRegular);

    const baseOff = pressureModifier(55, [], playoffs);
    const withTraitOff = pressureModifier(55, ["playoffPerformer"], playoffs);
    expect(withTraitOff).toBeGreaterThan(baseOff);
  });
});

describe("buffer de leadership (spec-player-model.md §7 : jamais sur soi-même, amortit le malus des coéquipiers)", () => {
  it("aucun buffer sans pression", () => {
    expect(teamLeadershipBufferStrength(90, 0)).toBe(0);
  });

  it("buffer croissant avec le leadership au-delà de la neutre, borné à 0.5", () => {
    const low = teamLeadershipBufferStrength(PRESSURE.leadershipNeutral, 100);
    const high = teamLeadershipBufferStrength(99, 100);
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(0);
    expect(high).toBeLessThanOrEqual(0.5);
  });

  it("applyLeadershipBuffer atténue un malus mais ne dépasse jamais 1, et n'affecte pas un boost", () => {
    const buffered = applyLeadershipBuffer(0.8, 0.5);
    expect(buffered).toBeGreaterThan(0.8);
    expect(buffered).toBeLessThan(1);

    expect(applyLeadershipBuffer(1.05, 0.5)).toBe(1.05);
  });
});

describe("computeVarianceFactor / applyVarianceToSkills (spec §4.2 métronome/erratique)", () => {
  it("un joueur sans le trait reste toujours à 1, quel que soit le tirage", () => {
    const player = makeFive("variance-none")[0]!;
    const rng = createRng("variance-none-rng");
    for (let i = 0; i < 20; i++) expect(computeVarianceFactor(player, rng)).toBe(1);
  });

  it("métronome a une dispersion plus faible qu'erratique sur le même nombre de tirages", () => {
    const metronome = withTraits(makeFive("variance-metronome")[0]!, ["metronome"]);
    const erratic = withTraits(makeFive("variance-erratic")[0]!, ["erratic"]);
    const rng = createRng("variance-spread-rng");

    const metronomeSpread = Array.from({ length: 200 }, () => Math.abs(computeVarianceFactor(metronome, rng) - 1));
    const erraticSpread = Array.from({ length: 200 }, () => Math.abs(computeVarianceFactor(erratic, rng) - 1));

    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(metronomeSpread)).toBeLessThan(avg(erraticSpread));

    for (const f of [...metronomeSpread, ...erraticSpread]) {
      expect(f).toBeLessThanOrEqual(MENTAL.varianceFactorMax - 1 + 1e-9);
    }
  });

  it("applyVarianceToSkills : identité à facteur 1, mise à l'échelle et bornage [0, 99] sinon", () => {
    const player = makeFive("variance-apply")[0]!;
    expect(applyVarianceToSkills(player.skills, 1)).toBe(player.skills);

    const scaledUp = applyVarianceToSkills(player.skills, 1.3);
    for (const key of Object.keys(player.skills) as (keyof Player["skills"])[]) {
      expect(scaledUp[key]).toBeLessThanOrEqual(99);
      expect(scaledUp[key]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("effectiveGameStaminaFactor / effectiveInjuryGamesOut (trait Guerrier, spec §4.2)", () => {
  it("un joueur sans Guerrier subit la pénalité de fatigue normale", () => {
    const player = makeFive("warrior-none")[0]!;
    expect(effectiveGameStaminaFactor(player, 0)).toBe(gameStaminaFactor(0));
  });

  it("Guerrier atténue la pénalité de fatigue sans jamais dépasser 1", () => {
    const warrior = withTraits(makeFive("warrior-fatigue")[0]!, ["warrior"]);
    const factor = effectiveGameStaminaFactor(warrior, 0);
    expect(factor).toBeGreaterThan(gameStaminaFactor(0));
    expect(factor).toBeLessThanOrEqual(1);
  });

  it("Guerrier réduit la durée d'indisponibilité après blessure, plancher à 1 match", () => {
    const player = makeFive("warrior-injury-none")[0]!;
    expect(effectiveInjuryGamesOut(player, 10)).toBe(10);

    const warrior = withTraits(makeFive("warrior-injury")[0]!, ["warrior"]);
    expect(effectiveInjuryGamesOut(warrior, 10)).toBe(Math.round(10 * MENTAL.warriorInjuryRecoveryMultiplier));
    expect(effectiveInjuryGamesOut(warrior, 1)).toBe(1);
  });
});

describe("disciplineOffensiveFoulWeight (docs/decisions.md — TODO P1 résolu Session 3)", () => {
  it("discipline élevée réduit le poids, discipline faible l'augmente, plancher à 1", () => {
    const neutral = disciplineOffensiveFoulWeight(75);
    const disciplined = disciplineOffensiveFoulWeight(95);
    const undisciplined = disciplineOffensiveFoulWeight(20);

    expect(disciplined).toBeLessThan(neutral);
    expect(undisciplined).toBeGreaterThan(neutral);
    expect(disciplined).toBeGreaterThanOrEqual(1);
  });
});
