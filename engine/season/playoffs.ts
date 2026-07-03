/**
 * Play-in et bracket playoffs (spec-tests-phase1.md §1 "Saison et playoffs",
 * CLAUDE.md boucle annuelle : "Play-in (7e-10e) → Playoffs → Finales FBL").
 * Format standard NBA repris tel quel (non protégé, cf. CLAUDE.md).
 */
import type { RNG } from "../utils/rng.js";
import type { GameContextInfo } from "../types/index.js";

/** Simule un seul match entre deux équipes ; découplé du moteur de possession pour rester testable. */
export type GameSimulator = (
  homeTeamId: string,
  awayTeamId: string,
  rng: RNG,
  context: GameContextInfo,
) => { homeScore: number; awayScore: number };

export interface SeriesResult {
  winnerTeamId: string;
  loserTeamId: string;
  winnerWins: number;
  loserWins: number;
  gamesPlayed: number;
}

/** Format 2-2-1-1-1 : la meilleure seed reçoit les matchs 1, 2, 5 et 7. */
const SERIES_HOME_PATTERN = ["HIGHER", "HIGHER", "LOWER", "LOWER", "HIGHER", "LOWER", "HIGHER"] as const;

/**
 * Série au meilleur des 7 (4 victoires) — spec : "une série s'arrête à 4 victoires".
 * `gameTier` distingue playoffs de conférence et Finales FBL (spec-player-model §7
 * "base(typeMatch)", plan P2 §Session 3) ; élimination/game 7 dérivés du score de
 * série courant, connu à chaque itération de cette boucle.
 */
export function simulateSeries(
  rng: RNG,
  higherSeedTeamId: string,
  lowerSeedTeamId: string,
  playGame: GameSimulator,
  gameTier: "PLAYOFFS" | "FINALS" = "PLAYOFFS",
): SeriesResult {
  let higherWins = 0;
  let lowerWins = 0;
  let gamesPlayed = 0;

  for (const homeSide of SERIES_HOME_PATTERN) {
    if (higherWins === 4 || lowerWins === 4) break;
    const homeTeamId = homeSide === "HIGHER" ? higherSeedTeamId : lowerSeedTeamId;
    const awayTeamId = homeSide === "HIGHER" ? lowerSeedTeamId : higherSeedTeamId;
    const context: GameContextInfo = {
      gameTier,
      isEliminationGame: higherWins === 3 || lowerWins === 3,
      isGame7: higherWins === 3 && lowerWins === 3,
    };
    const { homeScore, awayScore } = playGame(homeTeamId, awayTeamId, rng, context);
    gamesPlayed++;
    const homeWon = homeScore > awayScore;
    const higherWon = (homeWon && homeSide === "HIGHER") || (!homeWon && homeSide === "LOWER");
    if (higherWon) higherWins++;
    else lowerWins++;
  }

  const winnerIsHigher = higherWins === 4;
  return {
    winnerTeamId: winnerIsHigher ? higherSeedTeamId : lowerSeedTeamId,
    loserTeamId: winnerIsHigher ? lowerSeedTeamId : higherSeedTeamId,
    winnerWins: winnerIsHigher ? higherWins : lowerWins,
    loserWins: winnerIsHigher ? lowerWins : higherWins,
    gamesPlayed,
  };
}

export interface PlayInSeeds {
  seven: string;
  eight: string;
  nine: string;
  ten: string;
}

export interface PlayInResult {
  seventhSeedTeamId: string;
  eighthSeedTeamId: string;
}

/**
 * Play-in standard : 7v8 (le vainqueur est 7e), 9v10, puis perdant(7v8) vs vainqueur(9v10) pour la 8e place.
 * Enjeu (plan P2 §Session 3) : le 7v8 n'élimine personne (le perdant rejoue le
 * match décisif) ; 9v10 et le match décisif éliminent le perdant de la saison.
 */
export function runPlayIn(rng: RNG, seeds: PlayInSeeds, playGame: GameSimulator): PlayInResult {
  const firstGame = playGame(seeds.seven, seeds.eight, rng, {
    gameTier: "PLAY_IN",
    isEliminationGame: false,
    isGame7: false,
  });
  const sevenWon = firstGame.homeScore > firstGame.awayScore;
  const seventhSeedTeamId = sevenWon ? seeds.seven : seeds.eight;
  const firstGameLoserTeamId = sevenWon ? seeds.eight : seeds.seven;

  const secondGame = playGame(seeds.nine, seeds.ten, rng, {
    gameTier: "PLAY_IN",
    isEliminationGame: true,
    isGame7: false,
  });
  const winnerOfNineTen = secondGame.homeScore > secondGame.awayScore ? seeds.nine : seeds.ten;

  // Le perdant du 7v8 reste mieux classé : il reçoit le match décisif.
  const decisiveGame = playGame(firstGameLoserTeamId, winnerOfNineTen, rng, {
    gameTier: "PLAY_IN",
    isEliminationGame: true,
    isGame7: false,
  });
  const eighthSeedTeamId =
    decisiveGame.homeScore > decisiveGame.awayScore ? firstGameLoserTeamId : winnerOfNineTen;

  return { seventhSeedTeamId, eighthSeedTeamId };
}

export interface TeamSeed {
  teamId: string;
  /** Rang (1 = meilleur). Utilisé pour l'avantage du terrain (meilleure seed = higher). */
  seed: number;
}

export interface BracketResult {
  championTeamId: string;
  /** Résultats de chaque série, round par round (round 0 = 1er tour, etc.). */
  rounds: SeriesResult[][];
}

/**
 * Bracket à 8 équipes, appariements 1-8/2-7/3-6/4-5 (spec-tests-phase1 §1).
 * `seeds` est indexé par rang (seeds[0] = seed n°1, ..., seeds[7] = seed n°8).
 */
export function runConferenceBracket(rng: RNG, seeds: readonly TeamSeed[], playGame: GameSimulator): BracketResult {
  if (seeds.length !== 8) {
    throw new Error(`runConferenceBracket: 8 seeds attendues, reçu ${seeds.length}`);
  }
  // Réordonnancement standard pour que les paires adjacentes soient 1-8, 4-5, 2-7, 3-6,
  // et que les vainqueurs adjacents se retrouvent au tour suivant dans le bon ordre.
  const order: TeamSeed[] = [
    seeds[0] as TeamSeed,
    seeds[7] as TeamSeed,
    seeds[3] as TeamSeed,
    seeds[4] as TeamSeed,
    seeds[1] as TeamSeed,
    seeds[6] as TeamSeed,
    seeds[2] as TeamSeed,
    seeds[5] as TeamSeed,
  ];

  const rounds: SeriesResult[][] = [];
  let round = order;

  while (round.length > 1) {
    const nextRound: TeamSeed[] = [];
    const roundResults: SeriesResult[] = [];

    for (let i = 0; i < round.length; i += 2) {
      const a = round[i] as TeamSeed;
      const b = round[i + 1] as TeamSeed;
      const higher = a.seed < b.seed ? a : b;
      const lower = a.seed < b.seed ? b : a;

      const result = simulateSeries(rng, higher.teamId, lower.teamId, playGame, "PLAYOFFS");
      roundResults.push(result);
      nextRound.push(result.winnerTeamId === higher.teamId ? higher : lower);
    }

    rounds.push(roundResults);
    round = nextRound;
  }

  return { championTeamId: (round[0] as TeamSeed).teamId, rounds };
}

/**
 * Finales FBL : avantage du terrain à la meilleure seed (spec : "avantage du terrain
 * à la meilleure seed"). Les deux `seed` fournis doivent être comparables entre
 * conférences (ex. rang au classement général de la ligue), pas le rang de
 * conférence brut (1-8) qui n'est comparable qu'au sein d'une même conférence.
 */
export function runFinals(
  rng: RNG,
  conferenceChampionA: TeamSeed,
  conferenceChampionB: TeamSeed,
  playGame: GameSimulator,
): SeriesResult {
  const higher = conferenceChampionA.seed <= conferenceChampionB.seed ? conferenceChampionA : conferenceChampionB;
  const lower = conferenceChampionA.seed <= conferenceChampionB.seed ? conferenceChampionB : conferenceChampionA;
  return simulateSeries(rng, higher.teamId, lower.teamId, playGame, "FINALS");
}
