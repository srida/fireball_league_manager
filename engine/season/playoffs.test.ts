import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { runConferenceBracket, runFinals, runPlayIn, simulateSeries, type GameSimulator, type TeamSeed } from "./playoffs.js";
import type { GameContextInfo } from "../types/index.js";

const homeAlwaysWins = () => ({ homeScore: 100, awayScore: 90 });
const awayAlwaysWins = () => ({ homeScore: 90, awayScore: 100 });

/** Capture le contexte reçu par chaque match, dans l'ordre d'appel (plan P2 §Session 3). */
function contextCapturingSimulator(winner: "HOME" | "AWAY"): { playGame: GameSimulator; contexts: GameContextInfo[] } {
  const contexts: GameContextInfo[] = [];
  const playGame: GameSimulator = (_home, _away, _rng, context) => {
    contexts.push(context);
    return winner === "HOME" ? { homeScore: 100, awayScore: 90 } : { homeScore: 90, awayScore: 100 };
  };
  return { playGame, contexts };
}

describe("simulateSeries — best-of-7, format 2-2-1-1-1 (spec-tests-phase1 §1)", () => {
  it("une série s'arrête à 4 victoires, jamais plus de 7 matchs", () => {
    const rng = createRng("series-length");
    const result = simulateSeries(rng, "HIGH", "LOW", homeAlwaysWins);
    expect(result.gamesPlayed).toBeLessThanOrEqual(7);
    expect(Math.max(result.winnerWins, result.loserWins)).toBe(4);
  });

  it("l'hôte gagnant systématiquement, la meilleure seed l'emporte 4-3 (elle reçoit le match 7)", () => {
    const rng = createRng("series-home-advantage");
    const result = simulateSeries(rng, "HIGH", "LOW", homeAlwaysWins);
    expect(result.winnerTeamId).toBe("HIGH");
    expect(result.winnerWins).toBe(4);
    expect(result.loserWins).toBe(3);
    expect(result.gamesPlayed).toBe(7);
  });

  it("l'extérieur gagnant systématiquement, la moins bonne seed peut l'emporter", () => {
    const rng = createRng("series-away-advantage");
    const result = simulateSeries(rng, "HIGH", "LOW", awayAlwaysWins);
    expect(result.winnerTeamId).toBe("LOW");
    expect(result.gamesPlayed).toBe(7);
  });
});

describe("runPlayIn — format 7v8 / 9v10 (spec-tests-phase1 §1, CLAUDE.md boucle annuelle)", () => {
  it("l'hôte gagnant systématiquement : 7 reste 7e, 8 reste 8e", () => {
    const rng = createRng("play-in-home-wins");
    const result = runPlayIn(rng, { seven: "S7", eight: "S8", nine: "S9", ten: "S10" }, homeAlwaysWins);
    expect(result.seventhSeedTeamId).toBe("S7");
    expect(result.eighthSeedTeamId).toBe("S8");
  });

  it("le vainqueur de 9v10 peut décrocher la 8e place en battant le perdant de 7v8", () => {
    const rng = createRng("play-in-away-wins");
    const result = runPlayIn(rng, { seven: "S7", eight: "S8", nine: "S9", ten: "S10" }, awayAlwaysWins);
    // 7v8 (hôte=7) : l'extérieur (8) gagne → 7e = 8, perdant = 7.
    // 9v10 (hôte=9) : l'extérieur (10) gagne → winner910 = 10.
    // décisif (hôte=7, perdant du 1er match) vs 10 : l'extérieur (10) gagne → 8e = 10.
    expect(result.seventhSeedTeamId).toBe("S8");
    expect(result.eighthSeedTeamId).toBe("S10");
  });
});

describe("runConferenceBracket — appariements 1-8/2-7/3-6/4-5 (spec-tests-phase1 §1)", () => {
  const seeds: TeamSeed[] = Array.from({ length: 8 }, (_, i) => ({ teamId: `SEED_${i + 1}`, seed: i + 1 }));

  it("l'hôte gagnant systématiquement, la seed 1 remporte le titre de conférence", () => {
    const rng = createRng("bracket-home-wins");
    const result = runConferenceBracket(rng, seeds, homeAlwaysWins);
    expect(result.championTeamId).toBe("SEED_1");
    expect(result.rounds).toHaveLength(3); // 1/4, 1/2, finale de conférence
    expect(result.rounds[0]).toHaveLength(4);
    expect(result.rounds[1]).toHaveLength(2);
    expect(result.rounds[2]).toHaveLength(1);
  });

  it("le premier tour oppose bien 1-8, 4-5, 2-7 et 3-6", () => {
    const rng = createRng("bracket-matchups");
    const result = runConferenceBracket(rng, seeds, homeAlwaysWins);
    const firstRound = result.rounds[0]!;
    const matchupSeeds = firstRound.map((r) => [r.winnerTeamId, r.loserTeamId].sort());
    expect(matchupSeeds).toContainEqual(["SEED_1", "SEED_8"].sort());
    expect(matchupSeeds).toContainEqual(["SEED_4", "SEED_5"].sort());
    expect(matchupSeeds).toContainEqual(["SEED_2", "SEED_7"].sort());
    expect(matchupSeeds).toContainEqual(["SEED_3", "SEED_6"].sort());
  });

  it("rejette un nombre de seeds différent de 8", () => {
    const rng = createRng("bracket-invalid");
    expect(() => runConferenceBracket(rng, seeds.slice(0, 6), homeAlwaysWins)).toThrow();
  });
});

describe("runFinals — avantage du terrain à la meilleure seed", () => {
  it("la meilleure seed (rang global) reçoit l'avantage du terrain et gagne si l'hôte gagne toujours", () => {
    const rng = createRng("finals-home-wins");
    const champA: TeamSeed = { teamId: "CONF_A_CHAMP", seed: 2 };
    const champB: TeamSeed = { teamId: "CONF_B_CHAMP", seed: 5 };
    const result = runFinals(rng, champA, champB, homeAlwaysWins);
    expect(result.winnerTeamId).toBe("CONF_A_CHAMP");
  });
});

describe("enjeu de match — gameTier/élimination/game 7 (plan-développement §Phase 2 — Session 3)", () => {
  it("runPlayIn : 7v8 n'élimine personne, 9v10 et le match décisif éliminent le perdant", () => {
    const { playGame, contexts } = contextCapturingSimulator("HOME");
    const rng = createRng("play-in-context");
    runPlayIn(rng, { seven: "S7", eight: "S8", nine: "S9", ten: "S10" }, playGame);

    expect(contexts).toHaveLength(3);
    expect(contexts.every((c) => c.gameTier === "PLAY_IN")).toBe(true);
    expect(contexts[0]!.isEliminationGame).toBe(false);
    expect(contexts[1]!.isEliminationGame).toBe(true);
    expect(contexts[2]!.isEliminationGame).toBe(true);
    expect(contexts.every((c) => c.isGame7 === false)).toBe(true);
  });

  it("simulateSeries : élimination dès qu'une équipe a 3 victoires, game 7 seulement à 3-3", () => {
    const { playGame, contexts } = contextCapturingSimulator("HOME");
    const rng = createRng("series-context-home-wins");
    simulateSeries(rng, "HIGH", "LOW", playGame, "PLAYOFFS");

    // L'hôte gagne systématiquement : avec le pattern 2-2-1-1-1, la meilleure
    // seed l'emporte 4-3 en 7 matchs (même scénario que le test "avantage du
    // terrain" ci-dessus) — 3-2 après le match 6, donc élimination dès le
    // match 6 (index 5), Game 7 seulement au dernier.
    expect(contexts).toHaveLength(7);
    expect(contexts.every((c) => c.gameTier === "PLAYOFFS")).toBe(true);
    expect(contexts.slice(0, 5).every((c) => c.isEliminationGame === false)).toBe(true);
    expect(contexts[5]!.isEliminationGame).toBe(true);
    expect(contexts[5]!.isGame7).toBe(false);
    expect(contexts[6]!.isEliminationGame).toBe(true);
    expect(contexts[6]!.isGame7).toBe(true);
  });

  it("simulateSeries : série qui va à 7 matchs marque le dernier match comme Game 7", () => {
    const rng = createRng("series-context-alternating");
    // Séquence "l'hôte gagne" choisie pour que, combinée au pattern hôte 2-2-1-1-1
    // (HIGHER, HIGHER, LOWER, LOWER, HIGHER, LOWER, HIGHER), higher/lower gagnent
    // alternativement et atteignent 3-3 après 6 matchs, décidant au 7e.
    const homeWinsAt = [true, false, false, true, true, true, true];
    let call = 0;
    const contexts: GameContextInfo[] = [];
    const alternating: GameSimulator = (_home, _away, _rng, context) => {
      contexts.push(context);
      const homeWins = homeWinsAt[call]!;
      call++;
      return homeWins ? { homeScore: 100, awayScore: 90 } : { homeScore: 90, awayScore: 100 };
    };
    const result = simulateSeries(rng, "HIGH", "LOW", alternating, "FINALS");

    expect(result.gamesPlayed).toBe(7);
    expect(contexts).toHaveLength(7);
    expect(contexts[6]!.isGame7).toBe(true);
    expect(contexts[6]!.isEliminationGame).toBe(true);
    expect(contexts.slice(0, 5).every((c) => c.isGame7 === false)).toBe(true);
  });
});
