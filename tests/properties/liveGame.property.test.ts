/**
 * Tests de propriétés (spec-tests-phase1.md §2, plan-développement §Phase 2 —
 * Session 4) : le mode match live ne doit jamais dévier du mode instantané en
 * l'absence d'intervention, sur un échantillon de seeds — pas seulement le cas
 * unique déjà couvert par le test unitaire (liveGame.test.ts).
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/utils/rng.js";
import { generateLeague } from "../../engine/generation/league.js";
import { simulateGame } from "../../engine/simulation/game.js";
import { LiveGameSession } from "../../engine/simulation/liveGame.js";

const SAMPLE_SIZE = 60;

describe(`LiveGameSession sans intervention == simulateGame sur ${SAMPLE_SIZE} matchs seedés (plan P2 §Session 4)`, () => {
  it("logs d'événements strictement identiques pour chaque seed", () => {
    const league = generateLeague("live-property-league");
    const teams = league.teams;

    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const home = teams[i % teams.length]!;
      const away = teams[(i + 7) % teams.length]!;
      if (home.id === away.id) continue;

      const options = {
        gameId: `live-prop-${i}`,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeRoster: home.roster,
        awayRoster: away.roster,
        homeTactics: home.tactics,
        awayTactics: away.tactics,
      };

      const instant = simulateGame(createRng(`live-property-game-${i}`), options);

      const session = new LiveGameSession(createRng(`live-property-game-${i}`), options);
      let snap = session.step();
      while (!snap.isOver) snap = session.step();
      const live = session.getResult();

      expect(live.game.events).toEqual(instant.game.events);
      expect(live.game.homeScore).toBe(instant.game.homeScore);
      expect(live.game.awayScore).toBe(instant.game.awayScore);
    }
  });
});
