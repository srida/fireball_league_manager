import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { generateLeague } from "../generation/league.js";
import { generateDraftClass } from "../generation/draftClass.js";
import { DRAFT_LOTTERY, LEAGUE_GENERATION } from "../config/tuning.js";
import { playerOverallRating } from "../players/development.js";
import { applyDraftToRosters, computeDraftOrder, runDraft } from "./draft.js";
import type { TeamStanding } from "../season/standings.js";

/** 30 équipes à bilans strictement décroissants — évite toute logique de tie-breaker, hors scope ici. */
function makeStandings(teamIds: readonly string[]): TeamStanding[] {
  return teamIds.map((teamId, i) => ({
    teamId,
    wins: 82 - i * 2,
    losses: i * 2,
    winPct: (82 - i * 2) / 82,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDifferential: 0,
  }));
}

describe("computeDraftOrder — lottery (plan-développement §Phase 3 — Session 2)", () => {
  const league = generateLeague("draft-order-league");
  const teamIds = league.teams.map((t) => t.id);
  const standings = makeStandings(teamIds);
  const worstToBest = [...teamIds].reverse();

  it("produit un ordre de 30 équipes uniques", () => {
    const order = computeDraftOrder(createRng("draft-order-1"), standings);
    expect(order).toHaveLength(30);
    expect(new Set(order).size).toBe(30);
  });

  it("les équipes qualifiées aux playoffs (non-lottery) gardent l'ordre inversé du classement, en fin de draft", () => {
    const order = computeDraftOrder(createRng("draft-order-2"), standings);
    const nonLotteryExpected = worstToBest.slice(DRAFT_LOTTERY.lotteryTeamCount);
    expect(order.slice(DRAFT_LOTTERY.lotteryTeamCount)).toEqual(nonLotteryExpected);
  });

  it("est déterministe pour une seed donnée", () => {
    const a = computeDraftOrder(createRng("draft-order-determinism"), standings);
    const b = computeDraftOrder(createRng("draft-order-determinism"), standings);
    expect(a).toEqual(b);
  });

  it("les 3 pires équipes ont des chances quasi égales d'obtenir le pick 1, sur un grand nombre de tirages", () => {
    const worstThree = worstToBest.slice(0, 3);
    const counts = new Map(worstThree.map((id) => [id, 0]));
    const trials = 3000;
    for (let i = 0; i < trials; i++) {
      const order = computeDraftOrder(createRng(`draft-order-lottery-${i}`), standings);
      const pickOne = order[0] as string;
      if (counts.has(pickOne)) counts.set(pickOne, (counts.get(pickOne) ?? 0) + 1);
    }
    const frequencies = worstThree.map((id) => (counts.get(id) ?? 0) / trials);
    // Chacune devrait tourner autour de 14% (spec : "à égalité de chances") — tolérance large pour rester non-flaky.
    for (const freq of frequencies) {
      expect(freq).toBeGreaterThan(0.08);
      expect(freq).toBeLessThan(0.22);
    }
    // Écart max entre les trois ne doit pas trahir un déséquilibre structurel.
    expect(Math.max(...frequencies) - Math.min(...frequencies)).toBeLessThan(0.1);
  });

  it("une équipe qualifiée aux playoffs (hors lottery) n'obtient jamais le pick 1", () => {
    const nonLotteryIds = new Set(worstToBest.slice(DRAFT_LOTTERY.lotteryTeamCount));
    for (let i = 0; i < 50; i++) {
      const order = computeDraftOrder(createRng(`draft-order-no-playoff-pick1-${i}`), standings);
      expect(nonLotteryIds.has(order[0] as string)).toBe(false);
    }
  });
});

describe("runDraft — 2 tours, meilleur talent disponible (plan-développement §Phase 3 — Session 2)", () => {
  it("assigne exactement 2 picks par équipe (60 au total) quand le pool est suffisant", () => {
    const rng = createRng("run-draft-full");
    const league = generateLeague("run-draft-league");
    const order = league.teams.map((t) => t.id);
    const prospects = generateDraftClass(rng, "2027-10-01", 0);
    expect(prospects.length).toBeGreaterThanOrEqual(60);

    const result = runDraft(order, prospects);
    expect(result.picks).toHaveLength(60);
    expect(result.undraftedProspects.length).toBe(prospects.length - 60);

    const picksByTeam = new Map<string, number>();
    for (const pick of result.picks) picksByTeam.set(pick.teamId, (picksByTeam.get(pick.teamId) ?? 0) + 1);
    for (const teamId of order) expect(picksByTeam.get(teamId)).toBe(2);
  });

  it("la séquence des picks est triée du meilleur au moins bon prospect (aucune notion de besoin d'équipe cette session)", () => {
    const rng = createRng("run-draft-ordering");
    const league = generateLeague("run-draft-ordering-league");
    const order = league.teams.map((t) => t.id);
    const prospects = generateDraftClass(rng, "2027-10-01", 0);

    const result = runDraft(order, prospects);
    const values = result.picks.map((p) => playerOverallRating(p.prospect) * 0.4 + p.prospect.hidden.potential * 0.6);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual((values[i - 1] as number) + 1e-9);
    }
  });
});

describe("applyDraftToRosters — extension temporaire à 17 puis coupe à 15 (plan-développement §Phase 3 — Session 2)", () => {
  it("chaque roster revient à `LEAGUE_GENERATION.rosterSize` après le draft, numéros de maillot uniques", () => {
    const rng = createRng("apply-draft-roster");
    const league = generateLeague("apply-draft-league");
    const order = league.teams.map((t) => t.id);
    const prospects = generateDraftClass(rng, "2027-10-01", 0);
    const result = runDraft(order, prospects);

    applyDraftToRosters(rng, league, result);

    for (const team of league.teams) {
      expect(team.roster).toHaveLength(LEAGUE_GENERATION.rosterSize);
      const numbers = team.roster.map((p) => p.jerseyNumber);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });
});
