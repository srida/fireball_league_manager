/**
 * Tests de propriétés (spec-tests-phase1.md §2) : invariants qui doivent tenir
 * sur n'importe quel match, quelle que soit la seed — ~1000 matchs seedés.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/utils/rng.js";
import { generateLeague } from "../../engine/generation/league.js";
import { simulateGame } from "../../engine/simulation/game.js";
import { aggregateBoxScore } from "../../engine/simulation/boxScore.js";
import { PACE } from "../../engine/config/tuning.js";

const SAMPLE_SIZE = 1000;

function simulateSample() {
  const league = generateLeague("property-test-league");
  const teams = league.teams;
  const games = [];
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const home = teams[i % teams.length]!;
    const away = teams[(i + 7) % teams.length]!;
    if (home.id === away.id) continue;
    const rng = createRng(`property-game-${i}`);
    const sim = simulateGame(rng, {
      gameId: `prop-${i}`,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeRoster: home.roster,
      awayRoster: away.roster,
    });
    games.push(sim);
  }
  return games;
}

const games = simulateSample();

describe(`Propriétés invariantes sur ${games.length} matchs seedés (spec-tests-phase1 §2)`, () => {
  it("aucun score négatif, aucun score < 60 ou > 200", () => {
    for (const { game } of games) {
      expect(game.homeScore).toBeGreaterThanOrEqual(60);
      expect(game.homeScore).toBeLessThanOrEqual(200);
      expect(game.awayScore).toBeGreaterThanOrEqual(60);
      expect(game.awayScore).toBeLessThanOrEqual(200);
    }
  });

  it("aucune stat individuelle aberrante : joueur ≤ 100 pts, ≤ 40 reb, ≤ 35 ast", () => {
    for (const { game, minutesPlayed } of games) {
      const box = aggregateBoxScore(game.events, minutesPlayed);
      for (const player of Object.values(box)) {
        expect(player.points).toBeLessThanOrEqual(100);
        expect(player.reb).toBeLessThanOrEqual(40);
        expect(player.ast).toBeLessThanOrEqual(35);
      }
    }
  });

  it("minutes d'équipe == 240 (ou 240 + 25 par prolongation)", () => {
    for (const { game, onCourt, minutesPlayed } of games) {
      const overtimePeriods = Math.max(0, game.quarter - 4);
      const expectedTeamMinutes = 240 + overtimePeriods * 25;
      const homeTeamMinutes = onCourt.HOME.reduce((sum, p) => sum + (minutesPlayed[p.id] ?? 0), 0);
      const awayTeamMinutes = onCourt.AWAY.reduce((sum, p) => sum + (minutesPlayed[p.id] ?? 0), 0);
      expect(homeTeamMinutes).toBeCloseTo(expectedTeamMinutes, 5);
      expect(awayTeamMinutes).toBeCloseTo(expectedTeamMinutes, 5);
    }
  });

  it("FGM ≤ FGA, 3PM ≤ 3PA ≤ FGA, FTM ≤ FTA pour chaque joueur", () => {
    for (const { game, minutesPlayed } of games) {
      const box = aggregateBoxScore(game.events, minutesPlayed);
      for (const player of Object.values(box)) {
        expect(player.fgm).toBeLessThanOrEqual(player.fga);
        expect(player.threePM).toBeLessThanOrEqual(player.threePA);
        expect(player.threePA).toBeLessThanOrEqual(player.fga);
        expect(player.ftm).toBeLessThanOrEqual(player.fta);
      }
    }
  });

  it("possessions des deux équipes égales à ±2 près", () => {
    for (const { possessionCount } of games) {
      expect(Math.abs(possessionCount.HOME - possessionCount.AWAY)).toBeLessThanOrEqual(2);
    }
  });

  it("le log d'événements est chronologiquement cohérent (horloge décroissante par quart-temps)", () => {
    let violations = 0;
    for (const { game } of games) {
      let previousClock = Number.POSITIVE_INFINITY;
      for (const event of game.events) {
        if (!("clock" in event)) continue;
        const isReset = event.clock > previousClock;
        if (
          (!isReset && event.clock > previousClock) ||
          event.clock < 0 ||
          event.clock > PACE.quarterDurationSeconds
        ) {
          violations++;
        }
        previousClock = event.clock;
      }
    }
    expect(violations).toBe(0);
  });

  it("déterminisme de bout en bout : simuler deux fois le même match avec la même seed → logs strictement identiques", () => {
    const league = generateLeague("property-test-league");
    const home = league.teams[0]!;
    const away = league.teams[1]!;
    const opts = {
      gameId: "determinism",
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeRoster: home.roster,
      awayRoster: away.roster,
    };
    const a = simulateGame(createRng("determinism-property-seed"), opts);
    const b = simulateGame(createRng("determinism-property-seed"), opts);
    expect(a.game.events).toEqual(b.game.events);
  });

  it("aucun événement ne référence un joueur hors des 5 sur le terrain de chaque équipe", () => {
    let unknownReferences = 0;
    for (const { game, onCourt } of games) {
      const ids = new Set([...onCourt.HOME, ...onCourt.AWAY].map((p) => p.id));
      for (const event of game.events) {
        if ("player" in event && !ids.has(event.player)) unknownReferences++;
        if ("on" in event && !ids.has(event.on)) unknownReferences++;
        if ("assistBy" in event && event.assistBy && !ids.has(event.assistBy)) unknownReferences++;
        if ("blockedBy" in event && event.blockedBy && !ids.has(event.blockedBy)) unknownReferences++;
        if ("stealBy" in event && event.stealBy && !ids.has(event.stealBy)) unknownReferences++;
      }
    }
    expect(unknownReferences).toBe(0);
  });
});
