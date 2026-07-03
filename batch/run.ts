/**
 * Harnais de simulation batch (CLAUDE.md — "npm run batch -- --seasons=50 --seed=X").
 * Simule N saisons complètes (même ligue générée une fois depuis la seed,
 * rejouée N fois avec des tirages différents) et affiche les distributions
 * de la spec (spec-possession-algorithm.md §11, spec-tests-phase1.md §3).
 */
import { generateLeague } from "../engine/generation/league.js";
import { simulateSeason } from "../engine/season/season.js";
import { createRng } from "../engine/utils/rng.js";
import { LEAGUE_TARGETS } from "../engine/config/tuning.js";
import { BatchAccumulator, type SeasonMetrics } from "./metrics.js";

function parseArgs(argv: readonly string[]): { seasons: number; seed: string } {
  let seasons = 10;
  let seed = "fblm-batch-default";
  for (const arg of argv) {
    const seasonsMatch = /^--seasons=(\d+)$/.exec(arg);
    if (seasonsMatch) seasons = Number(seasonsMatch[1]);
    const seedMatch = /^--seed=(.+)$/.exec(arg);
    if (seedMatch) seed = seedMatch[1] as string;
  }
  return { seasons, seed };
}

function inRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

function report(metrics: SeasonMetrics, seasons: number, elapsedMs: number): void {
  const rows: { métrique: string; valeur: string; cible: string; ok: string }[] = [
    {
      métrique: "Points/équipe/match",
      valeur: metrics.pointsPerTeamPerGame.toFixed(1),
      cible: `${LEAGUE_TARGETS.pointsPerTeamPerGame.min}-${LEAGUE_TARGETS.pointsPerTeamPerGame.max}`,
      ok: inRange(metrics.pointsPerTeamPerGame, LEAGUE_TARGETS.pointsPerTeamPerGame) ? "OK" : "HORS CIBLE",
    },
    {
      métrique: "FG%",
      valeur: `${(metrics.fgPercent * 100).toFixed(1)}%`,
      cible: `${LEAGUE_TARGETS.fgPercent.min * 100}-${LEAGUE_TARGETS.fgPercent.max * 100}%`,
      ok: inRange(metrics.fgPercent, LEAGUE_TARGETS.fgPercent) ? "OK" : "HORS CIBLE",
    },
    {
      métrique: "Part de tirs à 3pts",
      valeur: `${(metrics.threePointAttemptShare * 100).toFixed(1)}%`,
      cible: `${LEAGUE_TARGETS.threePointAttemptShare.min * 100}-${LEAGUE_TARGETS.threePointAttemptShare.max * 100}%`,
      ok: inRange(metrics.threePointAttemptShare, LEAGUE_TARGETS.threePointAttemptShare) ? "OK" : "HORS CIBLE",
    },
    {
      métrique: "3P%",
      valeur: `${(metrics.threePointPercent * 100).toFixed(1)}%`,
      cible: `${LEAGUE_TARGETS.threePointPercent.min * 100}-${LEAGUE_TARGETS.threePointPercent.max * 100}%`,
      ok: inRange(metrics.threePointPercent, LEAGUE_TARGETS.threePointPercent) ? "OK" : "HORS CIBLE",
    },
    {
      métrique: "Turnovers/équipe/match",
      valeur: metrics.turnoversPerTeamPerGame.toFixed(1),
      cible: `${LEAGUE_TARGETS.turnoversPerTeamPerGame.min}-${LEAGUE_TARGETS.turnoversPerTeamPerGame.max}`,
      ok: inRange(metrics.turnoversPerTeamPerGame, LEAGUE_TARGETS.turnoversPerTeamPerGame) ? "OK" : "HORS CIBLE",
    },
    {
      métrique: "Rebonds offensifs",
      valeur: `${(metrics.offensiveReboundShare * 100).toFixed(1)}%`,
      cible: `${LEAGUE_TARGETS.offensiveReboundShare.min * 100}-${LEAGUE_TARGETS.offensiveReboundShare.max * 100}%`,
      ok: inRange(metrics.offensiveReboundShare, LEAGUE_TARGETS.offensiveReboundShare) ? "OK" : "HORS CIBLE",
    },
    {
      métrique: "Victoires à domicile",
      valeur: `${(metrics.homeWinPercent * 100).toFixed(1)}%`,
      cible: `${LEAGUE_TARGETS.homeWinPercent.min * 100}-${LEAGUE_TARGETS.homeWinPercent.max * 100}%`,
      ok: inRange(metrics.homeWinPercent, LEAGUE_TARGETS.homeWinPercent) ? "OK" : "HORS CIBLE",
    },
    {
      métrique: "Meilleur scoreur (pts/match)",
      valeur: metrics.topScorerPpg.toFixed(1),
      cible: `${LEAGUE_TARGETS.topScorerPpg.min}-${LEAGUE_TARGETS.topScorerPpg.max}`,
      ok: inRange(metrics.topScorerPpg, LEAGUE_TARGETS.topScorerPpg) ? "OK" : "HORS CIBLE",
    },
    {
      métrique: "Wins meilleure équipe (moy.)",
      valeur: metrics.bestTeamWins.toFixed(1),
      cible: `~${LEAGUE_TARGETS.winsSpreadBestVsWorst.best}`,
      ok: "—",
    },
    {
      métrique: "Wins pire équipe (moy.)",
      valeur: metrics.worstTeamWins.toFixed(1),
      cible: `~${LEAGUE_TARGETS.winsSpreadBestVsWorst.worst}`,
      ok: "—",
    },
    {
      métrique: "Corrélation talent → wins (r)",
      valeur: metrics.talentWinsCorrelation.toFixed(3),
      cible: "> 0.7",
      ok: metrics.talentWinsCorrelation > 0.7 ? "OK" : "HORS CIBLE",
    },
    {
      métrique: "Blessures/équipe/saison",
      valeur: metrics.injuriesPerTeamPerSeason.toFixed(1),
      cible: `${LEAGUE_TARGETS.injuriesPerTeamPerSeason.min}-${LEAGUE_TARGETS.injuriesPerTeamPerSeason.max}`,
      ok: inRange(metrics.injuriesPerTeamPerSeason, LEAGUE_TARGETS.injuriesPerTeamPerSeason) ? "OK" : "HORS CIBLE",
    },
  ];

  console.log(`\nBatch : ${seasons} saison(s) simulée(s) en ${(elapsedMs / 1000).toFixed(1)}s (${(elapsedMs / seasons / 1000).toFixed(1)}s/saison)\n`);
  console.table(rows);
}

async function main(): Promise<void> {
  const { seasons, seed } = parseArgs(process.argv.slice(2));
  console.log(`Génération de la ligue — seed = "${seed}"`);
  const league = generateLeague(seed);

  const accumulator = new BatchAccumulator(league);
  const t0 = Date.now();
  for (let i = 0; i < seasons; i++) {
    const rng = createRng(`${seed}-season-${i}`);
    // Chaque saison est consommée par l'accumulateur puis peut être GC (pas de
    // rétention du tableau complet — voir docs/decisions.md "Harnais batch en streaming").
    accumulator.addSeason(simulateSeason(rng, league));
    process.stdout.write(`\rSaison ${i + 1}/${seasons} simulée...`);
  }
  const elapsedMs = Date.now() - t0;
  console.log();

  const metrics = accumulator.finalize();
  report(metrics, seasons, elapsedMs);
}

main();
