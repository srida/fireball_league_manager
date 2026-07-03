import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { runConferenceBracket, runFinals, runPlayIn, simulateSeries, type TeamSeed } from "./playoffs.js";

const homeAlwaysWins = () => ({ homeScore: 100, awayScore: 90 });
const awayAlwaysWins = () => ({ homeScore: 90, awayScore: 100 });

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
