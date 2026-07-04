/**
 * Pilotage de saison pas-à-pas (plan P2 §Session 5 — UI "coach mode") :
 * contrairement à `simulateSeason` (season.ts), qui joue une saison complète
 * d'une traite pour le harnais batch/les tests, `SeasonRunner` avance
 * calendrier régulier match par match — les rencontres qui n'impliquent pas
 * l'équipe du joueur sont simulées automatiquement en instantané dès qu'on
 * demande le prochain match de son équipe, pour garder l'état de ligue
 * (classement, forme, blessures) cohérent sans jamais faire jouer l'IA en direct.
 *
 * Portée : saison régulière uniquement pour cette première tranche jouable —
 * play-in/playoffs (playoffs.ts) restent pilotés par `simulateSeason` côté
 * batch, pas encore par une UI interactive (à étendre plus tard, non-scope ici).
 *
 * Réutilise `createGameDriver` (gameDriver.ts) pour la fatigue/blessures —
 * même règle que `simulateSeason`, une seule source de vérité.
 */
import { generateSchedule, type Fixture } from "./schedule.js";
import { computeStandings, standingsForConference, type TeamStanding } from "./standings.js";
import { createGameDriver } from "./gameDriver.js";
import { simulateGame } from "../simulation/game.js";
import { LiveGameSession } from "../simulation/liveGame.js";
import type { RNG } from "../utils/rng.js";
import type { Game, GameContextInfo, League } from "../types/index.js";
import type { SimulateGameOptions, SimulatedGame } from "../simulation/gameEngine.js";

const REGULAR_SEASON_CONTEXT: GameContextInfo = {
  gameTier: "REGULAR_SEASON",
  isEliminationGame: false,
  isGame7: false,
};

export interface UpcomingGame {
  fixture: Fixture;
  isHome: boolean;
  opponentTeamId: string;
  options: SimulateGameOptions;
}

export interface PlayerAvailabilityView {
  fitness: number;
  injuryGamesRemaining: number;
}

export interface SeasonRunner {
  readonly league: League;
  readonly finishedGames: readonly Game[];
  readonly totalFixtures: number;
  readonly gamesRemaining: number;
  getStandings(): TeamStanding[];
  getConferenceStandings(conference: string): TeamStanding[];
  /**
   * Simule automatiquement (instantané) tous les matchs jusqu'au prochain
   * match de `teamId`, puis renvoie ce match prêt à jouer (non simulé).
   * `undefined` si le calendrier régulier est épuisé. Idempotent : rappeler
   * sans avoir appelé `commitGame` renvoie le même match préparé.
   */
  advanceToNextGameOf(teamId: string): UpcomingGame | undefined;
  /** Lance une session live (interventions possibles) pour un match préparé par `advanceToNextGameOf`. */
  startLiveGame(upcoming: UpcomingGame): LiveGameSession;
  /** Simule un match préparé par `advanceToNextGameOf` en résultat instantané. */
  simulateInstant(upcoming: UpcomingGame): SimulatedGame;
  /** Enregistre le résultat d'un match du joueur (issu de `startLiveGame` ou `simulateInstant`) et avance le calendrier. */
  commitGame(upcoming: UpcomingGame, simulated: SimulatedGame): void;
  getAvailability(playerId: string): PlayerAvailabilityView;
  getLastResultsOf(teamId: string, count: number): Game[];
  /** Prochaine date de calendrier pour `teamId`, sans effet de bord (pour affichage Hub avant confirmation). */
  peekNextFixtureOf(teamId: string): Fixture | undefined;
  /** Vrai si le prochain match de `teamId` sera un back-to-back (alerte fitness Hub). */
  isNextGameBackToBackFor(teamId: string): boolean;
  /** Nombre total de matchs de saison régulière au calendrier de `teamId` (82 en configuration standard). */
  totalGamesFor(teamId: string): number;
}

export function createSeasonRunner(rng: RNG, league: League): SeasonRunner {
  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  const fixtures = generateSchedule(league);
  const driver = createGameDriver(teamById);
  const finishedGames: Game[] = [];
  let cursor = 0;
  let cachedUserGame: { cursorAtPrepare: number; upcoming: UpcomingGame } | null = null;

  function recordGame(fixture: Fixture, simulated: SimulatedGame): Game {
    const game: Game = {
      id: `game-${finishedGames.length}`,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      status: "FINAL",
      homeScore: simulated.game.homeScore,
      awayScore: simulated.game.awayScore,
      quarter: simulated.game.quarter,
      events: simulated.game.events,
    };
    finishedGames.push(game);
    return game;
  }

  function simulateAndCommitOther(fixture: Fixture): void {
    const options = driver.prepare(rng, fixture.homeTeamId, fixture.awayTeamId, REGULAR_SEASON_CONTEXT, fixture.date);
    const simulated = simulateGame(rng, options);
    driver.commit(fixture.homeTeamId, fixture.awayTeamId, simulated, fixture.date);
    recordGame(fixture, simulated);
  }

  return {
    league,
    finishedGames,
    get totalFixtures() {
      return fixtures.length;
    },
    get gamesRemaining() {
      return fixtures.length - cursor;
    },

    getStandings: () => computeStandings(finishedGames, league),
    getConferenceStandings: (conference) => standingsForConference(computeStandings(finishedGames, league), league, conference),

    peekNextFixtureOf(teamId) {
      for (let i = cursor; i < fixtures.length; i++) {
        const fixture = fixtures[i] as Fixture;
        if (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId) return fixture;
      }
      return undefined;
    },

    advanceToNextGameOf(teamId) {
      while (cursor < fixtures.length) {
        const fixture = fixtures[cursor] as Fixture;
        const involved = fixture.homeTeamId === teamId || fixture.awayTeamId === teamId;
        if (!involved) {
          simulateAndCommitOther(fixture);
          cursor++;
          continue;
        }

        if (cachedUserGame && cachedUserGame.cursorAtPrepare === cursor) {
          return cachedUserGame.upcoming;
        }

        const options = driver.prepare(rng, fixture.homeTeamId, fixture.awayTeamId, REGULAR_SEASON_CONTEXT, fixture.date);
        const upcoming: UpcomingGame = {
          fixture,
          isHome: fixture.homeTeamId === teamId,
          opponentTeamId: fixture.homeTeamId === teamId ? fixture.awayTeamId : fixture.homeTeamId,
          options,
        };
        cachedUserGame = { cursorAtPrepare: cursor, upcoming };
        return upcoming;
      }
      return undefined;
    },

    startLiveGame(upcoming) {
      return new LiveGameSession(rng, upcoming.options);
    },

    simulateInstant(upcoming) {
      return simulateGame(rng, upcoming.options);
    },

    commitGame(upcoming, simulated) {
      driver.commit(upcoming.fixture.homeTeamId, upcoming.fixture.awayTeamId, simulated, upcoming.fixture.date);
      recordGame(upcoming.fixture, simulated);
      cachedUserGame = null;
      cursor++;
    },

    getAvailability: (playerId) => driver.getAvailability(playerId),

    isNextGameBackToBackFor(teamId) {
      const fixture = this.peekNextFixtureOf(teamId);
      if (!fixture) return false;
      return driver.isBackToBack(teamId, fixture.date);
    },

    totalGamesFor(teamId) {
      return fixtures.filter((f) => f.homeTeamId === teamId || f.awayTeamId === teamId).length;
    },

    getLastResultsOf(teamId, count) {
      return finishedGames
        .filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId)
        .slice(-count)
        .reverse();
    },
  };
}
