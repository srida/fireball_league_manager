/**
 * Harnais de simulation batch (CLAUDE.md — "npm run batch -- --seasons=50 --seed=X").
 * Simule N saisons complètes (même ligue générée une fois depuis la seed,
 * rejouée N fois avec des tirages différents) et affiche les distributions
 * de la spec (spec-possession-algorithm.md §11, spec-tests-phase1.md §3).
 */
import { generateLeague } from "../engine/generation/league.js";
import { simulateSeason } from "../engine/season/season.js";
import { runAnnualCycle } from "../engine/season/annualLoop.js";
import { trueProspectValue } from "../engine/market/draft.js";
import { createRng } from "../engine/utils/rng.js";
import { LEAGUE_TARGETS, PLAYER_GENERATION } from "../engine/config/tuning.js";
import { addYears } from "../engine/players/age.js";
import { playerOverallRating } from "../engine/players/development.js";
import type { League } from "../engine/types/index.js";
import { BatchAccumulator, type SeasonMetrics } from "./metrics.js";

/** Nombre de saisons après le draft avant d'évaluer le "vrai" devenir de carrière d'un rookie (plan P3 §Session 3). */
const CAREER_LOOKAHEAD_SEASONS = 4;

function findPlayerById(league: League, playerId: string) {
  for (const team of league.teams) {
    const player = team.roster.find((p) => p.id === playerId);
    if (player) return player;
  }
  return undefined;
}

function partition<T>(items: readonly T[], predicate: (item: T) => boolean): [T[], T[]] {
  const yes: T[] = [];
  const no: T[] = [];
  for (const item of items) (predicate(item) ? yes : no).push(item);
  return [yes, no];
}

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
  /** Steal : prospect dans le top 10 vraie valeur de la classe, drafté après le pick 20. */
  steals: number;
  /** Bust : prospect drafté dans les 5 premiers picks mais hors du top 15 vraie valeur de la classe. */
  busts: number;
}

/** Corrélation de Pearson — mesure si l'ordre de draft (bruité par le scouting) suit la vraie valeur des prospects. */
function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - meanX;
    const dy = (ys[i] as number) - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

function reportDraft(samples: readonly DraftSample[]): void {
  if (samples.length === 0) return;
  const rows = samples.map((s) => ({
    saison: s.season,
    "taille classe": s.classSize,
    "décalage cuvée": s.classQualityOffset.toFixed(1),
    "non draftés": s.undraftedCount,
    "note pick 1": s.pickOneOverall.toFixed(1),
    steals: s.steals,
    busts: s.busts,
  }));
  console.log(`\nDraft (plan-développement §Phase 3 — Sessions 2 et 3, lottery + 2 tours + scouting) :\n`);
  console.table(rows);
}

interface SummerLeagueSample {
  season: number;
  participants: number;
  averagePerformanceGrade: number;
}

function reportSummerLeague(samples: readonly SummerLeagueSample[]): void {
  if (samples.length === 0) return;
  const rows = samples.map((s) => ({
    saison: s.season,
    participants: s.participants,
    "note moyenne": s.averagePerformanceGrade.toFixed(1),
  }));
  console.log(`\nSummer League (plan-développement §Phase 3 — Session 4, rookies et jeunes < 3 saisons) :\n`);
  console.table(rows);
}

async function main(): Promise<void> {
  const { seasons, seed } = parseArgs(process.argv.slice(2));
  console.log(`Génération de la ligue — seed = "${seed}"`);
  const league = generateLeague(seed);

  const accumulator = new BatchAccumulator(league);
  const demographics: DemographicsSample[] = [];
  const draftSamples: DraftSample[] = [];
  const summerLeagueSamples: SummerLeagueSample[] = [];
  const pickNumbers: number[] = [];
  const pickTrueValues: number[] = [];
  // Devenir de carrière réel (plan P3 §Session 3 : "corrélation position de draft →
  // carrière positive mais imparfaite, r ~0.5-0.7") : chaque pick est suivi
  // `CAREER_LOOKAHEAD_SEASONS` saisons plus tard, quand son rating a eu le temps
  // de refléter progression/déclin/retraite, pas seulement la valeur au moment du pick.
  const pendingCareerRecords: { pickNumber: number; totalPicksThisDraft: number; playerId: string; dueAtSeasonIndex: number }[] = [];
  const careerDraftValues: number[] = [];
  const careerRatings: number[] = [];
  const t0 = Date.now();
  for (let i = 0; i < seasons; i++) {
    const rng = createRng(`${seed}-season-${i}`);
    // Chaque saison est consommée par l'accumulateur puis peut être GC (pas de
    // rétention du tableau complet — voir docs/decisions.md "Harnais batch en streaming").
    const season = simulateSeason(rng, league);
    accumulator.addSeason(season);

    // Boucle annuelle (plan-développement §Phase 3 — Session 4 : "fin de
    // playoffs → retraites → lottery → draft → Summer League → nouvelle
    // saison") — même `league` (et donc mêmes objets `Player`) réutilisée
    // d'une saison à l'autre dans cette boucle, contrairement au reste du
    // batch qui ne fait que lire `league` en lecture seule.
    const referenceDate = addYears(PLAYER_GENERATION.referenceDate, i + 1);
    const cycle = runAnnualCycle(rng, league, season, referenceDate);

    demographics.push({
      season: i + 1,
      averageAge: cycle.offseason.leagueAverageAge,
      retirements: cycle.offseason.retirements,
      replacementsGenerated: cycle.offseason.replacementsGenerated,
    });

    const { draft: draftResult } = cycle;
    const trueValueRankDesc = draftResult.picks.map((p) => trueProspectValue(p.prospect)).sort((a, b) => b - a);
    const top10TrueValueThreshold = trueValueRankDesc[9] ?? -Infinity;
    const top15TrueValueThreshold = trueValueRankDesc[14] ?? -Infinity;
    let steals = 0;
    let busts = 0;
    draftResult.picks.forEach((pick, index) => {
      const pickNumber = index + 1;
      const trueValue = trueProspectValue(pick.prospect);
      pickNumbers.push(pickNumber);
      pickTrueValues.push(trueValue);
      if (trueValue >= top10TrueValueThreshold && pickNumber > 20) steals++;
      if (pickNumber <= 5 && trueValue < top15TrueValueThreshold) busts++;
      pendingCareerRecords.push({
        pickNumber,
        totalPicksThisDraft: draftResult.picks.length,
        playerId: pick.prospect.id,
        dueAtSeasonIndex: i + CAREER_LOOKAHEAD_SEASONS,
      });
    });

    const pickOne = draftResult.picks[0];
    draftSamples.push({
      season: i + 1,
      classSize: cycle.draftClassSize,
      classQualityOffset: cycle.draftClassQualityOffset,
      undraftedCount: draftResult.undraftedProspects.length,
      pickOneOverall: pickOne ? playerOverallRating(pickOne.prospect) : 0,
      steals,
      busts,
    });

    summerLeagueSamples.push({
      season: i + 1,
      participants: cycle.summerLeague.participants.length,
      averagePerformanceGrade:
        cycle.summerLeague.participants.length === 0
          ? 0
          : cycle.summerLeague.participants.reduce((sum, p) => sum + p.performanceGrade, 0) / cycle.summerLeague.participants.length,
    });

    // Résolution des devenirs de carrière arrivés à échéance (draftés il y a
    // exactement `CAREER_LOOKAHEAD_SEASONS` saisons) : rating "définitif"
    // observé maintenant, pas au moment du pick. Un pick introuvable (coupé,
    // retraité) est ignoré — limite connue (biais de survivance), documentée
    // dans docs/decisions.md.
    const [dueRecords, stillPending] = partition(pendingCareerRecords, (r) => r.dueAtSeasonIndex === i);
    pendingCareerRecords.length = 0;
    pendingCareerRecords.push(...stillPending);
    for (const record of dueRecords) {
      const player = findPlayerById(league, record.playerId);
      if (!player) continue;
      careerDraftValues.push(record.totalPicksThisDraft - record.pickNumber + 1);
      careerRatings.push(playerOverallRating(player));
    }

    process.stdout.write(`\rSaison ${i + 1}/${seasons} simulée...`);
  }
  const elapsedMs = Date.now() - t0;
  console.log();

  const metrics = accumulator.finalize();
  report(metrics, seasons, elapsedMs);
  reportDemographics(demographics);
  reportDraft(draftSamples);
  reportSummerLeague(summerLeagueSamples);

  const totalSteals = draftSamples.reduce((sum, s) => sum + s.steals, 0);
  const totalBusts = draftSamples.reduce((sum, s) => sum + s.busts, 0);
  const immediateCorrelation = pickNumbers.length > 1 ? pearsonCorrelation(pickNumbers, pickTrueValues) : 0;
  console.log(
    `\nScouting — au moment du pick (plan-développement §Phase 3 — Session 3) : corrélation pick↔vraie valeur = ` +
      `${immediateCorrelation.toFixed(3)} (nettement négative sans être -1 : l'incertitude a un effet réel) — ` +
      `${totalSteals} steal(s), ${totalBusts} bust(s) au total.\n`,
  );

  if (careerDraftValues.length > 1) {
    const careerCorrelation = pearsonCorrelation(careerDraftValues, careerRatings);
    console.log(
      `Scouting — devenir de carrière réel, ${CAREER_LOOKAHEAD_SEASONS} saisons après le pick (cible spec : "r ~0.5-0.7", ` +
        `positive mais imparfaite) : corrélation position de draft ↔ rating réel = ${careerCorrelation.toFixed(3)} ` +
        `(sur ${careerDraftValues.length} picks suivis jusqu'à échéance).\n`,
    );
  } else {
    console.log(
      `Scouting — devenir de carrière réel : pas assez de saisons simulées (< ${CAREER_LOOKAHEAD_SEASONS + 1}) pour évaluer un seul pick jusqu'à échéance.\n`,
    );
  }
}

main();
