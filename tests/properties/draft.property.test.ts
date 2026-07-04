/**
 * Tests de propriétés (famille 2, étendue à la Phase 3 — Session 2) : la
 * lottery/draft doit produire un ordre valide quelle que soit la seed ou la
 * permutation des équipes en lice.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/utils/rng.js";
import { generateLeague } from "../../engine/generation/league.js";
import { computeDraftOrder } from "../../engine/market/draft.js";
import { DRAFT_LOTTERY } from "../../engine/config/tuning.js";
import type { TeamStanding } from "../../engine/season/standings.js";

function shuffledStandings(rng: ReturnType<typeof createRng>, teamIds: readonly string[]): TeamStanding[] {
  const shuffled = [...teamIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j] as string, shuffled[i] as string];
  }
  return shuffled.map((teamId, i) => ({
    teamId,
    wins: 82 - i,
    losses: i,
    winPct: (82 - i) / 82,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDifferential: 0,
  }));
}

describe("computeDraftOrder — invariants sur 100 classements aléatoires (plan P3 §Session 2)", () => {
  it("toujours 30 équipes uniques, jamais une équipe qualifiée aux playoffs avant le pick 15", () => {
    const league = generateLeague("draft-property-league");
    const teamIds = league.teams.map((t) => t.id);
    const rng = createRng("draft-property-shuffle");

    for (let i = 0; i < 100; i++) {
      const standings = shuffledStandings(rng, teamIds);
      const order = computeDraftOrder(createRng(`draft-property-order-${i}`), standings);

      expect(order).toHaveLength(30);
      expect(new Set(order).size).toBe(30);

      const worstToBest = [...standings].reverse().map((s) => s.teamId);
      const nonLotteryIds = new Set(worstToBest.slice(DRAFT_LOTTERY.lotteryTeamCount));
      for (const teamId of order.slice(0, DRAFT_LOTTERY.lotteryTeamCount)) {
        expect(nonLotteryIds.has(teamId)).toBe(false);
      }
    }
  });
});
