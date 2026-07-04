/**
 * Harnais de simulation batch (CLAUDE.md — "npm run batch -- --seasons=50 --seed=X").
 * Simule N saisons complètes (même ligue générée une fois depuis la seed,
 * rejouée N fois avec des tirages différents) et affiche les distributions
 * de la spec (spec-possession-algorithm.md §11, spec-tests-phase1.md §3).
 */
import { generateLeague } from "../engine/generation/league.js";
import { generateDraftClass, drawDraftClassQualityOffset } from "../engine/generation/draftClass.js";
import { simulateSeason } from "../engine/season/season.js";
import { runOffseason } from "../engine/season/offseason.js";
import { applyDraftToRosters, computeDraftOrder, runDraft } from "../engine/market/draft.js";
import { createRng } from "../engine/utils/rng.js";
import { LEAGUE_TARGETS, PLAYER_GENERATION } from "../engine/config/tuning.js";
import { addYears } from "../engine/players/age.js";
import { playerOverallRating } from "../engine/players/development.js";
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

interface DemographicsSample {
  season: number;
  averageAge: number;
  retirements: number;
  replacementsGenerated: number;
}

function reportDemographics(samples: readonly DemographicsSample[]): void {
  if (samples.length === 0) return;
  const rows = samples.map((s) => ({
    saison: s.season,
    "âge moyen ligue": s.averageAge.toFixed(2),
    cible: `${LEAGUE_TARGETS.leagueAverageAge.min}-${LEAGUE_TARGETS.leagueAverageAge.max}`,
    ok: inRange(s.averageAge, LEAGUE_TARGETS.leagueAverageAge) ? "OK" : "HORS CIBLE",
    retraites: s.retirements,
    remplaçants: s.replacementsGenerated,
  }));
  console.log(`\nDémographie de la ligue (plan-développement §Phase 3 — Session 1, intersaison) :\n`);
  console.table(rows);
}

interface DraftSample {
  season: number;
  classSize: number;
  classQualityOffset: number;
  undraftedCount: number;
  pickOneOverall: number;
}

function reportDraft(samples: readonly DraftSample[]): void {
  if (samples.length === 0) return;
  const rows = samples.map((s) => ({
    saison: s.season,
    "taille classe": s.classSize,
    "décalage cuvée": s.classQualityOffset.toFixed(1),
    "non draftés": s.undraftedCount,
    "note pick 1": s.pickOneOverall.toFixed(1),
  }));
  console.log(`\nDraft (plan-développement §Phase 3 — Session 2, lottery + 2 tours) :\n`);
  console.table(rows);
}

async function main(): Promise<void> {
  const { seasons, seed } = parseArgs(process.argv.slice(2));
  console.log(`Génération de la ligue — seed = "${seed}"`);
  const league = generateLeague(seed);

  const accumulator = new BatchAccumulator(league);
  const demographics: DemographicsSample[] = [];
  const draftSamples: DraftSample[] = [];
  const t0 = Date.now();
  for (let i = 0; i < seasons; i++) {
    const rng = createRng(`${seed}-season-${i}`);
    // Chaque saison est consommée par l'accumulateur puis peut être GC (pas de
    // rétention du tableau complet — voir docs/decisions.md "Harnais batch en streaming").
    const season = simulateSeason(rng, league);
    accumulator.addSeason(season);

    // Intersaison (plan-développement §Phase 3 — Session 1) : progression/déclin,
    // retraites, purge — même `league` (et donc même objets `Player`) réutilisée
    // d'une saison à l'autre dans cette boucle, contrairement au reste du batch
    // qui ne fait que lire `league` en lecture seule.
    const referenceDate = addYears(PLAYER_GENERATION.referenceDate, i + 1);
    const offseasonResult = runOffseason(rng, league, season.minutesByPlayer, referenceDate);
    demographics.push({
      season: i + 1,
      averageAge: offseasonResult.leagueAverageAge,
      retirements: offseasonResult.retirements,
      replacementsGenerated: offseasonResult.replacementsGenerated,
    });

    // Draft lottery + draft (plan-développement §Phase 3 — Session 2), à partir
    // du classement de la saison qui vient de se terminer — après l'intersaison
    // (les rosters sont déjà revenus à 15 avant que le draft ne les étende
    // temporairement à 17, cf. `applyDraftToRosters`).
    const classQualityOffset = drawDraftClassQualityOffset(rng);
    const prospects = generateDraftClass(rng, referenceDate, classQualityOffset);
    const order = computeDraftOrder(rng, season.standings);
    const draftResult = runDraft(order, prospects);
    applyDraftToRosters(rng, league, draftResult);
    const pickOne = draftResult.picks[0];
    draftSamples.push({
      season: i + 1,
      classSize: prospects.length,
      classQualityOffset,
      undraftedCount: draftResult.undraftedProspects.length,
      pickOneOverall: pickOne ? playerOverallRating(pickOne.prospect) : 0,
    });

    process.stdout.write(`\rSaison ${i + 1}/${seasons} simulée...`);
  }
  const elapsedMs = Date.now() - t0;
  console.log();

  const metrics = accumulator.finalize();
  report(metrics, seasons, elapsedMs);
  reportDemographics(demographics);
  reportDraft(draftSamples);
}

main();
