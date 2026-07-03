/**
 * Tests statistiques (spec-tests-phase1.md §3) : distributions ligue sur un
 * batch de saisons, comparées à `STATISTICAL_TEST_TARGETS` (bornes larges,
 * distinctes des curseurs de calibration serrés de `LEAGUE_TARGETS` — voir
 * tuning.ts). CI rapide : 10 saisons.
 *
 * `topScorerPpg` et `talentWinsCorrelation` restent en mode **warning** (pas
 * d'échec de test) : la spec autorise explicitement cette famille à tourner
 * en warning "en calibration en cours" avant de devenir bloquante. Écart
 * documenté dans docs/decisions.md ("Corrélation talent→wins instable",
 * "Meilleur scoreur toujours au-dessus de la cible").
 */
import { describe, expect, it } from "vitest";
import { generateLeague } from "../../engine/generation/league.js";
import { simulateSeason } from "../../engine/season/season.js";
import { createRng } from "../../engine/utils/rng.js";
import { BatchAccumulator } from "../../batch/metrics.js";
import { STATISTICAL_TEST_TARGETS } from "../../engine/config/tuning.js";

const SEASONS = 10;
const SEED = "fblm-statistical-test-v2";

function runBatch() {
  const league = generateLeague(`${SEED}-league`);
  const accumulator = new BatchAccumulator(league);
  for (let i = 0; i < SEASONS; i++) {
    accumulator.addSeason(simulateSeason(createRng(`${SEED}-${i}`), league));
  }
  return accumulator.finalize();
}

describe(`Distributions ligue sur ${SEASONS} saisons (spec-tests-phase1 §3)`, () => {
  const metrics = runBatch();

  it("points/équipe/match dans la cible", () => {
    expect(metrics.pointsPerTeamPerGame).toBeGreaterThanOrEqual(STATISTICAL_TEST_TARGETS.pointsPerTeamPerGame.min);
    expect(metrics.pointsPerTeamPerGame).toBeLessThanOrEqual(STATISTICAL_TEST_TARGETS.pointsPerTeamPerGame.max);
  });

  it("FG% dans la cible", () => {
    expect(metrics.fgPercent).toBeGreaterThanOrEqual(STATISTICAL_TEST_TARGETS.fgPercent.min);
    expect(metrics.fgPercent).toBeLessThanOrEqual(STATISTICAL_TEST_TARGETS.fgPercent.max);
  });

  it("part de tirs à 3pts dans la cible", () => {
    expect(metrics.threePointAttemptShare).toBeGreaterThanOrEqual(STATISTICAL_TEST_TARGETS.threePointAttemptShare.min);
    expect(metrics.threePointAttemptShare).toBeLessThanOrEqual(STATISTICAL_TEST_TARGETS.threePointAttemptShare.max);
  });

  it("3P% dans la cible", () => {
    expect(metrics.threePointPercent).toBeGreaterThanOrEqual(STATISTICAL_TEST_TARGETS.threePointPercent.min);
    expect(metrics.threePointPercent).toBeLessThanOrEqual(STATISTICAL_TEST_TARGETS.threePointPercent.max);
  });

  it("turnovers/équipe/match dans la cible", () => {
    expect(metrics.turnoversPerTeamPerGame).toBeGreaterThanOrEqual(STATISTICAL_TEST_TARGETS.turnoversPerTeamPerGame.min);
    expect(metrics.turnoversPerTeamPerGame).toBeLessThanOrEqual(STATISTICAL_TEST_TARGETS.turnoversPerTeamPerGame.max);
  });

  it("part de rebonds offensifs dans la cible", () => {
    expect(metrics.offensiveReboundShare).toBeGreaterThanOrEqual(STATISTICAL_TEST_TARGETS.offensiveReboundShare.min);
    expect(metrics.offensiveReboundShare).toBeLessThanOrEqual(STATISTICAL_TEST_TARGETS.offensiveReboundShare.max);
  });

  it("victoires à domicile dans la cible", () => {
    expect(metrics.homeWinPercent).toBeGreaterThanOrEqual(STATISTICAL_TEST_TARGETS.homeWinPercent.min);
    expect(metrics.homeWinPercent).toBeLessThanOrEqual(STATISTICAL_TEST_TARGETS.homeWinPercent.max);
  });

  it("meilleure et pire équipe (wins) dans la cible — pas de mur artificiel", () => {
    expect(metrics.bestTeamWins).toBeGreaterThanOrEqual(STATISTICAL_TEST_TARGETS.bestTeamWins.min);
    expect(metrics.bestTeamWins).toBeLessThanOrEqual(STATISTICAL_TEST_TARGETS.bestTeamWins.max);
    expect(metrics.worstTeamWins).toBeGreaterThanOrEqual(STATISTICAL_TEST_TARGETS.worstTeamWins.min);
    expect(metrics.worstTeamWins).toBeLessThanOrEqual(STATISTICAL_TEST_TARGETS.worstTeamWins.max);
    expect(metrics.bestTeamWins).toBeLessThan(82);
    expect(metrics.worstTeamWins).toBeGreaterThan(0);
  });

  it("[warning] meilleur scoreur ligue — écart connu, non bloquant (docs/decisions.md)", () => {
    const { min, max } = STATISTICAL_TEST_TARGETS.topScorerPpg;
    if (metrics.topScorerPpg < min || metrics.topScorerPpg > max) {
      console.warn(
        `[warning] topScorerPpg=${metrics.topScorerPpg.toFixed(1)} hors cible [${min}-${max}] — ` +
          "écart connu (P1 sans fatigue/rotations), voir docs/decisions.md.",
      );
    }
    expect(metrics.topScorerPpg).toBeGreaterThan(0);
  });

  it("[warning] corrélation talent → wins — instable d'une seed à l'autre, non bloquant (docs/decisions.md)", () => {
    if (metrics.talentWinsCorrelation <= STATISTICAL_TEST_TARGETS.talentWinsCorrelationMin) {
      console.warn(
        `[warning] talentWinsCorrelation=${metrics.talentWinsCorrelation.toFixed(3)} ≤ ` +
          `${STATISTICAL_TEST_TARGETS.talentWinsCorrelationMin} — écart connu, voir docs/decisions.md.`,
      );
    }
    expect(metrics.talentWinsCorrelation).toBeGreaterThan(0);
  });
}, 60_000);
