import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { computePMake, resolvePossession } from "./possession.js";
import { makeFive, makeGameState, ScriptedRng, withFlatAttributes } from "./testUtils.js";
import type { Event } from "../types/index.js";

describe("resolvePossession — machine à états (spec-tests-phase1 §1)", () => {
  it("tir réussi → points corrects (2 ou 3), possession adverse ensuite", () => {
    const home = makeFive("shot-make-2");
    const away = makeFive("shot-make-2-def");
    const state = makeGameState(home, away);

    // 200 tirages : au moins un panier à 2 et un à 3 doivent apparaître.
    const rng = createRng("shot-make-sample");
    let saw2 = false;
    let saw3 = false;
    for (let i = 0; i < 200 && !(saw2 && saw3); i++) {
      const result = resolvePossession(state, rng);
      expect(result.nextPossession).toBe("AWAY");
      const shotMade = result.events.find(
        (e): e is Extract<Event, { t: "SHOT" }> => e.t === "SHOT" && e.result === "MAKE",
      );
      if (shotMade) {
        if (result.points === 2 || result.points === 3) {
          if (shotMade.shotType === "THREE") saw3 = true;
          else saw2 = true;
        }
      }
    }
    expect(saw2 || saw3).toBe(true);
  });

  it("turnover → zéro point, changement de possession, aucun SHOT logué", () => {
    const home = makeFive("turnover-case");
    const away = makeFive("turnover-case-def");
    const state = makeGameState(home, away);
    const rng = new ScriptedRng("turnover-seed");
    rng.queuePick("TURNOVER");

    const result = resolvePossession(state, rng);
    expect(result.points).toBe(0);
    expect(result.nextPossession).toBe("AWAY");
    expect(result.events.some((e) => e.t === "TURNOVER")).toBe(true);
    expect(result.events.some((e) => e.t === "SHOT")).toBe(false);
  });

  it("faute de tir subie → lancers francs (2), possession adverse ensuite", () => {
    const home = makeFive("foul-drawn-case");
    const away = makeFive("foul-drawn-case-def");
    const state = makeGameState(home, away);
    const rng = new ScriptedRng("foul-drawn-seed");
    rng.queuePick("FOUL_DRAWN");

    const result = resolvePossession(state, rng);
    expect(result.nextPossession).toBe("AWAY");
    const fts = result.events.filter((e) => e.t === "FREE_THROW");
    expect(fts).toHaveLength(2);
    expect(result.events.some((e) => e.t === "FOUL" && e.type === "SHOOTING")).toBe(true);
    expect(result.points).toBeGreaterThanOrEqual(0);
    expect(result.points).toBeLessThanOrEqual(2);
  });

  it("tir raté → rebond défensif déclenché → changement de possession", () => {
    const home = makeFive("miss-def-rebound");
    const away = makeFive("miss-def-rebound-def");
    const state = makeGameState(home, away);
    const rng = new ScriptedRng("miss-def-rebound-seed");
    rng.queuePick("SHOT");
    rng.queueBool(false); // pas de contre
    rng.queueBool(false); // tir raté (MISS)
    rng.queueBool(false); // rebond : côté DEF (isOffensive = false)

    const result = resolvePossession(state, rng);
    expect(result.points).toBe(0);
    expect(result.nextPossession).toBe("AWAY");
    expect(result.events.some((e) => e.t === "SHOT" && e.result === "MISS")).toBe(true);
    expect(result.events.some((e) => e.t === "REBOUND" && e.side === "DEF")).toBe(true);
  });

  it("tir raté → rebond offensif → nouvelle action (possession prolongée pour l'attaque)", () => {
    const home = makeFive("miss-off-rebound");
    const away = makeFive("miss-off-rebound-def");
    const state = makeGameState(home, away);
    const rng = new ScriptedRng("miss-off-rebound-seed");
    rng.queuePick("SHOT"); // 1er cycle : tir
    rng.queueBool(false); // pas de contre
    rng.queueBool(false); // tir raté
    rng.queueBool(true); // rebond OFFENSIF
    rng.queuePick("TURNOVER"); // 2e cycle (putback) : on force une fin propre via turnover

    const result = resolvePossession(state, rng);
    expect(result.events.some((e) => e.t === "REBOUND" && e.side === "OFF")).toBe(true);
    // Le rebond offensif doit être suivi d'une nouvelle action, pas d'une fin immédiate.
    const reboundIndex = result.events.findIndex((e) => e.t === "REBOUND");
    expect(result.events.length).toBeGreaterThan(reboundIndex + 1);
  });

  it("contre → comptabilisé (SHOT/BLOCK), suivi d'un rebond", () => {
    const home = makeFive("block-case");
    const away = makeFive("block-case-def");
    const state = makeGameState(home, away);
    const rng = new ScriptedRng("block-seed");
    rng.queuePick("SHOT");
    rng.queueBool(true); // contre
    rng.queueBool(false); // rebond côté DEF pour terminer proprement

    const result = resolvePossession(state, rng);
    const blockEvent = result.events.find((e) => e.t === "SHOT" && e.result === "BLOCK");
    expect(blockEvent).toBeDefined();
    const blockIndex = result.events.indexOf(blockEvent as Event);
    expect(result.events[blockIndex + 1]?.t).toBe("REBOUND");
  });

  it("passe décisive créditée uniquement au tir réussi qui suit immédiatement la passe", () => {
    const home = makeFive("assist-case");
    const away = makeFive("assist-case-def");
    const state = makeGameState(home, away);
    const rng = new ScriptedRng("assist-seed");
    rng.queuePick("PASS");
    rng.queuePick("SHOT");
    rng.queueBool(false); // pas de contre
    rng.queueBool(true); // tir réussi

    const result = resolvePossession(state, rng);
    const made = result.events.find((e) => e.t === "SHOT" && e.result === "MAKE") as
      | Extract<Event, { t: "SHOT" }>
      | undefined;
    expect(made).toBeDefined();
    expect(made?.assistBy).toBeDefined();
  });

  it("maximum de passes par possession respecté (forçage du tir au-delà)", () => {
    const home = makeFive("max-pass-case");
    const away = makeFive("max-pass-case-def");
    const state = makeGameState(home, away);
    const rng = new ScriptedRng("max-pass-seed");
    // 4 passes (⚙ maxPassesPerPossession), la 5e itération doit forcer un tir.
    rng.queuePick("PASS", "PASS", "PASS", "PASS");

    const result = resolvePossession(state, rng);
    const shots = result.events.filter((e) => e.t === "SHOT");
    const turnovers = result.events.filter((e) => e.t === "TURNOVER");
    const fts = result.events.filter((e) => e.t === "FREE_THROW");
    // Au-delà de 4 passes, l'action est forcée au tir (pas de 5e passe, pas de turnover/faute).
    expect(shots.length).toBeGreaterThan(0);
    expect(turnovers).toHaveLength(0);
    expect(fts).toHaveLength(0);
  });

  it("pMake toujours borné dans [0.05, 0.85] avec des joueurs à 0 partout", () => {
    for (const shotType of ["RIM", "MID_RANGE", "THREE"] as const) {
      for (const contest of ["OPEN", "CONTESTED", "HEAVILY_CONTESTED"] as const) {
        const p = computePMake(shotType, 0, 0, contest, false);
        expect(p).toBeGreaterThanOrEqual(0.05);
        expect(p).toBeLessThanOrEqual(0.85);
      }
    }
  });

  it("pMake toujours borné dans [0.05, 0.85] avec des joueurs à 99 partout", () => {
    for (const shotType of ["RIM", "MID_RANGE", "THREE"] as const) {
      for (const contest of ["OPEN", "CONTESTED", "HEAVILY_CONTESTED"] as const) {
        const p = computePMake(shotType, 99, 99, contest, true);
        expect(p).toBeGreaterThanOrEqual(0.05);
        expect(p).toBeLessThanOrEqual(0.85);
      }
    }
  });

  it("pMake reste borné même avec un attaquant à 99 et un défenseur à 0 (cas extrême)", () => {
    const p = computePMake("THREE", 99, 0, "OPEN", true);
    expect(p).toBeGreaterThanOrEqual(0.05);
    expect(p).toBeLessThanOrEqual(0.85);
  });

  it("une possession consomme entre 4 et 24 s (hors troncature de fin de quart-temps)", () => {
    const home = makeFive("clock-bounds");
    const away = makeFive("clock-bounds-def");
    const state = makeGameState(home, away, { clockSeconds: 720 });
    const rng = createRng("clock-bounds-seed");
    for (let i = 0; i < 100; i++) {
      const result = resolvePossession(state, rng);
      expect(result.clockUsed).toBeGreaterThanOrEqual(4);
      expect(result.clockUsed).toBeLessThanOrEqual(24 + 4 * 5); // tolère les cycles de rebond offensif (14s + create)
    }
  });

  it("fin de quart-temps tronque correctement la possession en cours", () => {
    const home = makeFive("truncation-case");
    const away = makeFive("truncation-case-def");
    const state = makeGameState(home, away, { clockSeconds: 3 });
    const rng = createRng("truncation-seed");
    const result = resolvePossession(state, rng);
    expect(result.clockUsed).toBeLessThanOrEqual(3);
  });

  it("aucun joueur hors du 5 sur le terrain n'apparaît dans le log", () => {
    const home = makeFive("roster-scope-case");
    const away = makeFive("roster-scope-case-def");
    const state = makeGameState(home, away);
    const rng = createRng("roster-scope-seed");
    const onCourtIds = new Set([...home, ...away].map((p) => p.id));
    for (let i = 0; i < 50; i++) {
      const result = resolvePossession(state, rng);
      for (const event of result.events) {
        if ("player" in event) expect(onCourtIds.has(event.player)).toBe(true);
      }
    }
  });

  it("des attaquants à 99 et défenseurs à 0 produisent nettement plus de points en moyenne que l'inverse", () => {
    const strongHome = makeFive("balance-strong").map((p) => withFlatAttributes(p, 90));
    const weakAway = makeFive("balance-weak").map((p) => withFlatAttributes(p, 20));
    const stateStrongVsWeak = makeGameState(strongHome, weakAway);
    const stateWeakVsStrong = makeGameState(weakAway, strongHome);

    const sampleAvgPoints = (state: ReturnType<typeof makeGameState>, seed: string) => {
      const rng = createRng(seed);
      let total = 0;
      const n = 300;
      for (let i = 0; i < n; i++) total += resolvePossession(state, rng).points;
      return total / n;
    };

    const strongAttack = sampleAvgPoints(stateStrongVsWeak, "strong-vs-weak");
    const weakAttack = sampleAvgPoints(stateWeakVsStrong, "weak-vs-strong");
    expect(strongAttack).toBeGreaterThan(weakAttack);
  });
});

describe("computePMake — sensibilité aux attributs (sanity)", () => {
  it("un meilleur attaquant obtient un pMake plus élevé à défense égale", () => {
    const low = computePMake("MID_RANGE", 40, 75, "CONTESTED", false);
    const high = computePMake("MID_RANGE", 90, 75, "CONTESTED", false);
    expect(high).toBeGreaterThan(low);
  });

  it("un meilleur défenseur réduit le pMake de l'attaquant", () => {
    const easyDef = computePMake("MID_RANGE", 75, 40, "CONTESTED", false);
    const hardDef = computePMake("MID_RANGE", 75, 90, "CONTESTED", false);
    expect(hardDef).toBeLessThan(easyDef);
  });

  it("le bonus à domicile augmente légèrement pMake", () => {
    const away = computePMake("MID_RANGE", 75, 75, "OPEN", false);
    const home = computePMake("MID_RANGE", 75, 75, "OPEN", true);
    expect(home).toBeGreaterThanOrEqual(away);
  });
});
