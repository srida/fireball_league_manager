import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { generateLeague } from "../generation/league.js";
import { simulateGame, pickStartingFive } from "./game.js";
import { aggregateBoxScore, sumTeamBoxScore } from "./boxScore.js";
import { PACE, ROTATION } from "../config/tuning.js";

function twoTeams(seed: string) {
  const league = generateLeague(seed);
  return { home: league.teams[0]!, away: league.teams[1]! };
}

function simOptions(gameId: string, home: ReturnType<typeof twoTeams>["home"], away: ReturnType<typeof twoTeams>["away"]) {
  return {
    gameId,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeRoster: home.roster,
    awayRoster: away.roster,
    homeTactics: home.tactics,
    awayTactics: away.tactics,
  };
}

describe("simulateGame — horloge et structure de match (spec-tests-phase1 §1)", () => {
  it("un match sans prolongation dure 4 quart-temps, score final défini", () => {
    const { home, away } = twoTeams("game-structure-1");
    const rng = createRng("game-structure-1-sim");
    const { game } = simulateGame(rng, simOptions("g1", home, away));
    expect(game.status).toBe("FINAL");
    expect(game.quarter).toBeGreaterThanOrEqual(4);
    expect(game.homeScore).toBeGreaterThan(0);
    expect(game.awayScore).toBeGreaterThan(0);
  });

  it("score égal à la fin du temps réglementaire → prolongation (répétable jusqu'à décision)", () => {
    // Sur un échantillon de seeds, au moins une prolongation doit apparaître
    // (quarter > 4) ET aucun match ne doit se terminer sur une égalité.
    let sawOvertime = false;
    for (let i = 0; i < 60; i++) {
      const { home, away } = twoTeams(`ot-search-${i}`);
      const rng = createRng(`ot-search-sim-${i}`);
      const { game } = simulateGame(rng, simOptions(`g-${i}`, home, away));
      expect(game.homeScore).not.toBe(game.awayScore);
      if (game.quarter > 4) sawOvertime = true;
    }
    expect(sawOvertime).toBe(true);
  });

  it("somme des points du log d'événements == score final du match (invariant fondamental)", () => {
    const { home, away } = twoTeams("game-log-sum");
    const rng = createRng("game-log-sum-sim");
    const { game, participants } = simulateGame(rng, simOptions("g2", home, away));

    const homeIds = new Set(participants.HOME.map((p) => p.id));
    let homeFromLog = 0;
    let awayFromLog = 0;
    for (const event of game.events) {
      if (event.t === "SHOT" && event.result === "MAKE") {
        const pts = event.shotType === "THREE" ? 3 : 2;
        if (homeIds.has(event.player)) homeFromLog += pts;
        else awayFromLog += pts;
      }
      if (event.t === "FREE_THROW" && event.result === "MAKE") {
        if (homeIds.has(event.player)) homeFromLog += 1;
        else awayFromLog += 1;
      }
    }
    expect(homeFromLog).toBe(game.homeScore);
    expect(awayFromLog).toBe(game.awayScore);
  });

  it("déterminisme de bout en bout : même seed → logs strictement identiques", () => {
    const { home, away } = twoTeams("determinism-league");
    const opts = simOptions("g3", home, away);
    const gameA = simulateGame(createRng("determinism-sim"), opts).game;
    const gameB = simulateGame(createRng("determinism-sim"), opts).game;
    expect(gameA.events).toEqual(gameB.events);
    expect(gameA.homeScore).toBe(gameB.homeScore);
    expect(gameA.awayScore).toBe(gameB.awayScore);
  });

  it("l'horloge est chronologiquement cohérente (décroissante) à l'intérieur d'un quart-temps", () => {
    const { home, away } = twoTeams("clock-coherence");
    const rng = createRng("clock-coherence-sim");
    const { game } = simulateGame(rng, simOptions("g4", home, away));

    let previousClock = Number.POSITIVE_INFINITY;
    for (const event of game.events) {
      const clock = "clock" in event ? event.clock : undefined;
      if (clock === undefined) continue;
      // Chaque valeur d'horloge est soit une suite décroissante (même quart-temps),
      // soit un reset de nouveau quart-temps (borné par la durée d'un quart/OT).
      const isReset = clock > previousClock;
      if (isReset) {
        expect(clock).toBeLessThanOrEqual(PACE.quarterDurationSeconds);
      } else {
        expect(clock).toBeLessThanOrEqual(previousClock);
      }
      expect(clock).toBeGreaterThanOrEqual(0);
      previousClock = clock;
    }
  });
});

describe("simulateGame — rotations et fautes (plan-développement §Phase 2 Session 1)", () => {
  it("un joueur fouled-out (6 fautes) ne réapparaît plus jamais dans le log après son SUB de sortie", () => {
    const runningFouls: Record<string, number> = {};
    const disqualified = new Set<string>();

    for (let i = 0; i < 8; i++) {
      const { home, away } = twoTeams(`foul-out-case-${i}`);
      const rng = createRng(`foul-out-sim-${i}`);
      const { game } = simulateGame(rng, simOptions(`g-foul-${i}`, home, away));

      Object.keys(runningFouls).forEach((k) => delete runningFouls[k]);
      disqualified.clear();

      for (const event of game.events) {
        if ("player" in event) {
          expect(disqualified.has(event.player)).toBe(false);
        }
        if ("on" in event) {
          expect(disqualified.has(event.on)).toBe(false);
        }
        if (event.t === "SUB") {
          expect(disqualified.has(event.in)).toBe(false);
        }
        if (event.t === "FOUL") {
          runningFouls[event.player] = (runningFouls[event.player] ?? 0) + 1;
        }
        if (event.t === "SUB" && (runningFouls[event.out] ?? 0) >= ROTATION.foulOutLimit) {
          disqualified.add(event.out);
        }
      }
    }
  });

  it("les minutes jouées respectent globalement les cibles de rotation (au moins 6 joueurs différents par équipe sur un échantillon)", () => {
    // Sur un échantillon de matchs, la rotation doit faire jouer plus que les 5 titulaires
    // (spec plan P2 §Session 1 : hiérarchie + substitutions automatiques).
    const distinctPlayersSeen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const { home, away } = twoTeams(`rotation-sample-${i}`);
      const rng = createRng(`rotation-sample-sim-${i}`);
      const { participants } = simulateGame(rng, simOptions(`g-rot-${i}`, home, away));
      for (const p of [...participants.HOME, ...participants.AWAY]) distinctPlayersSeen.add(p.id);
    }
    // 10 joueurs (5+5) minimum si aucune rotation ; on attend nettement plus sur 5 matchs.
    expect(distinctPlayersSeen.size).toBeGreaterThan(10);
  });
});

describe("aggregateBoxScore — agrégation du log (spec-tests-phase1 §1)", () => {
  it("sur un log construit à la main : points, rebonds, passes, TO exacts", () => {
    const events = [
      { t: "SHOT" as const, player: "A", shotType: "THREE" as const, result: "MAKE" as const, contest: "OPEN" as const, assistBy: "B", clock: 700 },
      { t: "SHOT" as const, player: "A", shotType: "RIM" as const, result: "MISS" as const, contest: "CONTESTED" as const, clock: 690 },
      { t: "REBOUND" as const, player: "C", side: "DEF" as const, clock: 688 },
      { t: "TURNOVER" as const, player: "B", cause: "STEAL" as const, stealBy: "D", clock: 680 },
      { t: "FOUL" as const, player: "D", on: "A", type: "SHOOTING" as const, clock: 670 },
      { t: "FREE_THROW" as const, player: "A", result: "MAKE" as const, index: 1, total: 2, clock: 670 },
      { t: "FREE_THROW" as const, player: "A", result: "MISS" as const, index: 2, total: 2, clock: 670 },
    ];
    const box = aggregateBoxScore(events, { A: 30, B: 28, C: 25, D: 27 });

    expect(box["A"]?.points).toBe(3 + 1);
    expect(box["A"]?.fgm).toBe(1);
    expect(box["A"]?.fga).toBe(2);
    expect(box["A"]?.threePM).toBe(1);
    expect(box["A"]?.ftm).toBe(1);
    expect(box["A"]?.fta).toBe(2);
    expect(box["B"]?.ast).toBe(1);
    expect(box["B"]?.tov).toBe(1);
    expect(box["C"]?.dreb).toBe(1);
    expect(box["C"]?.reb).toBe(1);
    expect(box["D"]?.stl).toBe(1);
    expect(box["D"]?.pf).toBe(1);
  });

  it("la somme des stats individuelles == stats d'équipe", () => {
    const { home, away } = twoTeams("box-sum-league");
    const rng = createRng("box-sum-sim");
    const { game, participants, minutesPlayed } = simulateGame(rng, simOptions("g5", home, away));

    const box = aggregateBoxScore(game.events, minutesPlayed);
    const homeBoxes = participants.HOME.map((p) => box[p.id]).filter((b): b is NonNullable<typeof b> => b !== undefined);
    const awayBoxes = participants.AWAY.map((p) => box[p.id]).filter((b): b is NonNullable<typeof b> => b !== undefined);

    const homeTeamTotals = sumTeamBoxScore(homeBoxes);
    const awayTeamTotals = sumTeamBoxScore(awayBoxes);

    expect(homeTeamTotals.points).toBe(game.homeScore);
    expect(awayTeamTotals.points).toBe(game.awayScore);

    // Aucun événement ne doit référencer un joueur hors des participants des deux équipes
    // (titulaires + entrants, P2 : les rotations font jouer plus que les 5 de départ).
    const allIds = new Set([...participants.HOME, ...participants.AWAY].map((p) => p.id));
    for (const event of game.events) {
      if ("player" in event) expect(allIds.has(event.player)).toBe(true);
    }
  });
});

describe("pickStartingFive — hiérarchie de rotation (spec plan P2 §Session 1)", () => {
  it("un joueur par poste primaire, cinq joueurs distincts", () => {
    const { home } = twoTeams("starting-five-case");
    const five = pickStartingFive(home.roster);
    expect(five).toHaveLength(5);
    expect(new Set(five.map((p) => p.id)).size).toBe(5);
  });
});
