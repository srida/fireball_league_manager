import { describe, expect, it } from "vitest";
import { FATIGUE, INJURY, gameStaminaFactor } from "../config/tuning.js";
import { applyFatigueDrain, checkInjuries, deriveAge } from "./fatigue.js";
import { makeFive, makeGameState, ScriptedRng } from "./testUtils.js";

describe("gameStaminaFactor (spec-possession-algorithm.md §3, plan P2 §Session 2)", () => {
  it("aucune pénalité au-dessus du seuil", () => {
    expect(gameStaminaFactor(100)).toBe(1);
    expect(gameStaminaFactor(FATIGUE.noPenaltyThreshold)).toBe(1);
  });

  it("pénalité croissante en dessous du seuil, plancher respecté", () => {
    const atThresholdMinus10 = gameStaminaFactor(FATIGUE.noPenaltyThreshold - 10);
    expect(atThresholdMinus10).toBeLessThan(1);
    expect(atThresholdMinus10).toBeGreaterThanOrEqual(FATIGUE.minFactor);
    expect(gameStaminaFactor(0)).toBe(FATIGUE.minFactor);
  });
});

describe("deriveAge (spec-player-model.md §1, plan P2 §Session 2)", () => {
  it("âge dérivé correctement depuis birthDate et une date de référence", () => {
    expect(deriveAge("2000-01-01", "2026-10-01")).toBe(26);
    expect(deriveAge("2007-11-01", "2026-10-01")).toBe(18);
  });
});

describe("applyFatigueDrain (plan-développement §Phase 2 — Session 2)", () => {
  it("les joueurs sur le terrain perdent du gameStamina, les joueurs au banc en récupèrent", () => {
    const home = makeFive("fatigue-drain-home");
    const away = makeFive("fatigue-drain-away");
    const bench = makeFive("fatigue-drain-bench");
    const state = makeGameState(home, away, {
      gameStamina: Object.fromEntries(
        [...home, ...away, ...bench].map((p) => [p.id, 50]),
      ),
    });

    applyFatigueDrain(state, { HOME: [...home, ...bench], AWAY: away }, 120);

    for (const p of home) expect(state.gameStamina[p.id]).toBeLessThan(50);
    for (const p of bench) expect(state.gameStamina[p.id]).toBeGreaterThan(50);
  });

  it("gameStamina reste borné dans [0, 100]", () => {
    const home = makeFive("fatigue-bounds-home");
    const away = makeFive("fatigue-bounds-away");
    const bench = makeFive("fatigue-bounds-bench");
    const state = makeGameState(home, away, {
      gameStamina: Object.fromEntries([...home, ...away, ...bench].map((p) => [p.id, 50])),
    });

    // `home`/`away` sont sur le terrain (drain) ; `bench` n'y est pas (récupération).
    applyFatigueDrain(state, { HOME: home, AWAY: [...away, ...bench] }, 100_000);

    for (const p of home) expect(state.gameStamina[p.id]).toBe(0);
    for (const p of bench) expect(state.gameStamina[p.id]).toBe(100);
  });
});

describe("checkInjuries (plan-développement §Phase 2 — Session 2)", () => {
  it("émet un événement INJURY et enregistre la blessure quand le tirage est forcé", () => {
    const home = makeFive("injury-check-home");
    const away = makeFive("injury-check-away");
    const state = makeGameState(home, away);

    const rng = new ScriptedRng("injury-check-sim").queueBool(true);
    const result = checkInjuries(state, rng, 500);

    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.t).toBe("INJURY");
    if (event.t !== "INJURY") throw new Error("unreachable");
    expect(home.some((p) => p.id === event.player)).toBe(true);

    const injury = result.newInjuries[event.player]!;
    expect(INJURY.types.map((t) => t.severity)).toContain(injury.severity);
    const table = INJURY.types.find((t) => t.severity === injury.severity)!;
    expect(injury.gamesOut).toBeGreaterThanOrEqual(table.gamesRange[0]);
    expect(injury.gamesOut).toBeLessThanOrEqual(table.gamesRange[1]);
  });

  it("ignore un joueur déjà blessé ce match (pas de double comptage)", () => {
    const home = makeFive("injury-skip-home");
    const away = makeFive("injury-skip-away");
    const alreadyInjured = home[0]!.id;
    const state = makeGameState(home, away, {
      injuries: { [alreadyInjured]: { severity: "MINOR", gamesOut: 2 } },
    });

    const rng = new ScriptedRng("injury-skip-sim").queueBool(true, true, true, true, true, true, true, true, true, true);
    const result = checkInjuries(state, rng, 500);

    expect(result.newInjuries[alreadyInjured]).toBeUndefined();
  });

  it("aucune blessure quand le tirage n'est jamais forcé (probabilité de base très faible)", () => {
    const home = makeFive("injury-none-home");
    const away = makeFive("injury-none-away");
    const state = makeGameState(home, away);

    const rng = new ScriptedRng("injury-none-sim").queueBool(false, false, false, false, false, false, false, false, false, false);
    const result = checkInjuries(state, rng, 500);

    expect(result.events).toHaveLength(0);
    expect(Object.keys(result.newInjuries)).toHaveLength(0);
  });
});
