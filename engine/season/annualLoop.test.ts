import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { generateLeague } from "../generation/league.js";
import { simulateSeason } from "./season.js";
import { LEAGUE_GENERATION, PLAYER_GENERATION } from "../config/tuning.js";
import { addYears } from "../players/age.js";
import { runAnnualCycle } from "./annualLoop.js";

describe("runAnnualCycle — orchestrateur de la boucle annuelle (plan-développement §Phase 3 — Session 4)", () => {
  it("enchaîne intersaison, draft et Summer League en une seule passe, rosters cohérents en sortie", () => {
    const league = generateLeague("annual-loop-league");
    const rng = createRng("annual-loop-run");
    const season = simulateSeason(createRng("annual-loop-season"), league);
    const referenceDate = addYears(PLAYER_GENERATION.referenceDate, 1);

    const result = runAnnualCycle(rng, league, season, referenceDate);

    expect(result.referenceDate).toBe(referenceDate);
    expect(result.offseason.retirements).toBeGreaterThanOrEqual(0);
    expect(result.draft.picks.length).toBeGreaterThan(0);
    for (const team of league.teams) {
      expect(team.roster).toHaveLength(LEAGUE_GENERATION.rosterSize);
    }
    // Les rookies fraîchement draftés (seasonsInLeague=0) sont éligibles à la Summer League
    // qui vient de tourner après le draft — au moins un participant sur une ligue de 30 équipes.
    expect(result.summerLeague.participants.length).toBeGreaterThan(0);
  });

  it("est déterministe pour une seed donnée", () => {
    const runOnce = () => {
      const league = generateLeague("annual-loop-determinism-league");
      const season = simulateSeason(createRng("annual-loop-determinism-season"), league);
      const referenceDate = addYears(PLAYER_GENERATION.referenceDate, 1);
      const result = runAnnualCycle(createRng("annual-loop-determinism-run"), league, season, referenceDate);
      return result.draft.picks.map((p) => p.prospect.id);
    };

    expect(runOnce()).toEqual(runOnce());
  });
});
