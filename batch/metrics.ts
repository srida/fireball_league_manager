/**
 * Calcul des distributions statistiques sur un batch de saisons simulées
 * (spec-possession-algorithm.md §11, spec-tests-phase1.md §3). Utilisé par
 * `batch/run.ts` (harnais) et `batch/calibrate.ts` (analyse de sensibilité).
 *
 * Accumulateur en streaming (`BatchAccumulator`) plutôt qu'un calcul sur un
 * tableau de `SeasonResult[]` complet : retenir toutes les saisons (logs
 * d'événements complets, ~1230 matchs × des centaines d'événements chacun)
 * simultanément en mémoire fait sortir Node du tas sur un batch de 50 saisons
 * (CLAUDE.md — "batch de 50 saisons sans fuite mémoire, heap stable"). Chaque
 * saison n'est visitée qu'une fois puis peut être garbage-collectée.
 */
import { pickStartingFive } from "../engine/simulation/game.js";
import type { League, Team } from "../engine/types/index.js";
import type { SeasonResult } from "../engine/season/season.js";

export interface SeasonMetrics {
  pointsPerTeamPerGame: number;
  fgPercent: number;
  threePointAttemptShare: number;
  threePointPercent: number;
  turnoversPerTeamPerGame: number;
  offensiveReboundShare: number;
  homeWinPercent: number;
  topScorerPpg: number;
  bestTeamWins: number;
  worstTeamWins: number;
  talentWinsCorrelation: number;
}

/**
 * Note globale d'une équipe — sert uniquement au reporting batch (corrélation
 * talent→wins). Basée sur le 5 de départ uniquement : en P1 sans rotations
 * (docs/decisions.md), les 10 autres joueurs du roster ne jouent jamais et
 * diluaient complètement le signal si inclus dans la moyenne.
 */
export function teamOverallRating(team: Team): number {
  const startingFive = pickStartingFive(team.roster);
  const ratings = startingFive.map((p) => {
    const skillAvg = Object.values(p.skills).reduce((a, b) => a + b, 0) / Object.keys(p.skills).length;
    const physicalAvg = Object.values(p.physical).reduce((a, b) => a + b, 0) / Object.keys(p.physical).length;
    return skillAvg * 0.7 + physicalAvg * 0.3;
  });
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
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

/** Accumulateur streaming : une saison à la fois, mémoire bornée quel que soit le nombre de saisons. */
export class BatchAccumulator {
  private totalPoints = 0;
  private totalTeamGames = 0;
  private fgm = 0;
  private fga = 0;
  private threePA = 0;
  private threePM = 0;
  private turnovers = 0;
  private oreb = 0;
  private dreb = 0;
  private homeWins = 0;
  private totalGames = 0;
  private readonly talentRatings: number[] = [];
  private readonly winsSamples: number[] = [];
  private readonly topScorerPpgPerSeason: number[] = [];
  private bestTeamWins = -Infinity;
  private worstTeamWins = Infinity;
  private readonly ratingByTeam: Map<string, number>;

  constructor(league: League) {
    this.ratingByTeam = new Map(league.teams.map((t) => [t.id, teamOverallRating(t)]));
  }

  addSeason(season: SeasonResult): void {
    const pointsByPlayer = new Map<string, number>();

    for (const game of season.regularSeasonGames) {
      this.totalPoints += game.homeScore + game.awayScore;
      this.totalTeamGames += 2;
      this.totalGames++;
      if (game.homeScore > game.awayScore) this.homeWins++;

      for (const event of game.events) {
        if (event.t === "SHOT") {
          this.fga++;
          if (event.shotType === "THREE") this.threePA++;
          if (event.result === "MAKE") {
            this.fgm++;
            if (event.shotType === "THREE") this.threePM++;
            pointsByPlayer.set(event.player, (pointsByPlayer.get(event.player) ?? 0) + (event.shotType === "THREE" ? 3 : 2));
          }
        } else if (event.t === "TURNOVER") {
          this.turnovers++;
        } else if (event.t === "REBOUND") {
          if (event.side === "OFF") this.oreb++;
          else this.dreb++;
        } else if (event.t === "FREE_THROW" && event.result === "MAKE") {
          pointsByPlayer.set(event.player, (pointsByPlayer.get(event.player) ?? 0) + 1);
        }
      }
    }

    for (const standing of season.standings) {
      const rating = this.ratingByTeam.get(standing.teamId);
      if (rating !== undefined) {
        this.talentRatings.push(rating);
        this.winsSamples.push(standing.wins);
      }
      this.bestTeamWins = Math.max(this.bestTeamWins, standing.wins);
      this.worstTeamWins = Math.min(this.worstTeamWins, standing.wins);
    }

    this.topScorerPpgPerSeason.push(Math.max(...[...pointsByPlayer.values()].map((total) => total / 82)));
  }

  finalize(): SeasonMetrics {
    const topScorerPpg =
      this.topScorerPpgPerSeason.reduce((a, b) => a + b, 0) / this.topScorerPpgPerSeason.length;

    return {
      pointsPerTeamPerGame: this.totalPoints / this.totalTeamGames,
      fgPercent: this.fgm / this.fga,
      threePointAttemptShare: this.threePA / this.fga,
      threePointPercent: this.threePM / this.threePA,
      turnoversPerTeamPerGame: this.turnovers / this.totalTeamGames,
      offensiveReboundShare: this.oreb / (this.oreb + this.dreb),
      homeWinPercent: this.homeWins / this.totalGames,
      topScorerPpg,
      bestTeamWins: this.bestTeamWins,
      worstTeamWins: this.worstTeamWins,
      talentWinsCorrelation: pearsonCorrelation(this.talentRatings, this.winsSamples),
    };
  }
}

/** Confort pour les petits batches (tests) : simule l'API précédente sur un tableau déjà en mémoire. */
export function computeBatchMetrics(seasons: readonly SeasonResult[], league: League): SeasonMetrics {
  const accumulator = new BatchAccumulator(league);
  for (const season of seasons) accumulator.addSeason(season);
  return accumulator.finalize();
}
