/**
 * Orchestrateur de saison complète — relie calendrier, simulation de match,
 * classement, play-in et playoffs (CLAUDE.md boucle annuelle). Utilisé par
 * le harnais batch (Session D) et par les tests d'intégration de bout en bout.
 */
import { generateSchedule } from "./schedule.js";
import { computeStandings, standingsForConference, type TeamStanding } from "./standings.js";
import { runConferenceBracket, runFinals, runPlayIn, type BracketResult, type SeriesResult } from "./playoffs.js";
import { simulateGame } from "../simulation/game.js";
import { createGameDriver } from "./gameDriver.js";
import type { RNG } from "../utils/rng.js";
import type { Event, Game, GameContextInfo, League, Team } from "../types/index.js";

const REGULAR_SEASON_CONTEXT: GameContextInfo = {
  gameTier: "REGULAR_SEASON",
  isEliminationGame: false,
  isGame7: false,
};

export interface SeasonResult {
  regularSeasonGames: Game[];
  standings: TeamStanding[];
  playIn: Record<string, { seventhSeedTeamId: string; eighthSeedTeamId: string }>;
  conferenceBrackets: Record<string, BracketResult>;
  finals: SeriesResult;
  championTeamId: string;
  /**
   * Minutes totales jouées par joueur sur la saison régulière (plan-développement
   * §Phase 3 — Session 1 : entrée de la progression annuelle, `offseason.ts`).
   * Saison régulière uniquement (comme le hash golden master), les playoffs ne
   * sont pas comptabilisés.
   */
  minutesByPlayer: Record<string, number>;
}

interface RealGameResult {
  homeScore: number;
  awayScore: number;
  events: Event[];
  minutesPlayed: Record<string, number>;
}

/**
 * Simule un match unique via le moteur de possession réel (spec-possession-algorithm.md).
 * Délègue la persistance fitness/blessures/back-to-back inter-matchs à
 * `createGameDriver` (gameDriver.ts, extrait en Session 5 pour être partagé
 * avec le pilotage de saison pas-à-pas de l'UI, `seasonRunner.ts`) — cette
 * fermeture ne fait plus que brancher `simulateGame` sur le driver, pour la
 * saison régulière comme pour le play-in et les playoffs (même fermeture
 * réutilisée par tout `simulateSeason`). Accepte un `GameContextInfo` (plan P2
 * §Session 3 — gameTier/élimination/game 7), fourni par playoffs.ts pour le
 * play-in/playoffs/finales, défaut saison régulière pour les matchs de calendrier.
 */
function playRealGame(rng: RNG, teamById: Map<string, Team>) {
  const driver = createGameDriver(teamById);

  return (
    homeTeamId: string,
    awayTeamId: string,
    context: GameContextInfo = REGULAR_SEASON_CONTEXT,
    gameDate?: string,
  ): RealGameResult => {
    const options = driver.prepare(rng, homeTeamId, awayTeamId, context, gameDate);
    const simulated = simulateGame(rng, options);
    driver.commit(homeTeamId, awayTeamId, simulated, gameDate);
    return {
      homeScore: simulated.game.homeScore,
      awayScore: simulated.game.awayScore,
      events: simulated.game.events,
      minutesPlayed: simulated.minutesPlayed,
    };
  };
}

function top8Seeds(conferenceStandings: readonly TeamStanding[]) {
  return conferenceStandings.slice(0, 8).map((s, i) => ({ teamId: s.teamId, seed: i + 1 }));
}

/** Simule une saison complète : régulière, classement, play-in, playoffs, Finales FBL. */
export function simulateSeason(rng: RNG, league: League): SeasonResult {
  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  const fixtures = generateSchedule(league);
  const playGame = playRealGame(rng, teamById);

  const minutesByPlayer: Record<string, number> = {};
  const regularSeasonGames: Game[] = fixtures.map((f, i) => {
    const result = playGame(f.homeTeamId, f.awayTeamId, REGULAR_SEASON_CONTEXT, f.date);
    for (const [playerId, minutes] of Object.entries(result.minutesPlayed)) {
      minutesByPlayer[playerId] = (minutesByPlayer[playerId] ?? 0) + minutes;
    }
    return {
      id: `game-${i}`,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      status: "FINAL",
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      quarter: 4,
      events: result.events,
    };
  });

  const standings = computeStandings(regularSeasonGames, league);

  const playIn: SeasonResult["playIn"] = {};
  const conferenceBrackets: Record<string, BracketResult> = {};
  const conferenceChampions: { teamId: string; seed: number }[] = [];

  for (const conference of league.conferences) {
    const confStandings = standingsForConference(standings, league, conference);
    const top6 = confStandings.slice(0, 6).map((s, i) => ({ teamId: s.teamId, seed: i + 1 }));
    const seedsSeven = confStandings[6]?.teamId;
    const seedsEight = confStandings[7]?.teamId;
    const seedsNine = confStandings[8]?.teamId;
    const seedsTen = confStandings[9]?.teamId;

    if (!seedsSeven || !seedsEight || !seedsNine || !seedsTen) {
      throw new Error(`simulateSeason: conférence ${conference} n'a pas assez d'équipes pour le play-in`);
    }

    const playInResult = runPlayIn(
      rng,
      { seven: seedsSeven, eight: seedsEight, nine: seedsNine, ten: seedsTen },
      (home, away, _rng, context) => playGame(home, away, context),
    );
    playIn[conference] = playInResult;

    const top8 = [
      ...top6,
      { teamId: playInResult.seventhSeedTeamId, seed: 7 },
      { teamId: playInResult.eighthSeedTeamId, seed: 8 },
    ];

    const bracket = runConferenceBracket(rng, top8, (home, away, _rng, context) => playGame(home, away, context));
    conferenceBrackets[conference] = bracket;

    const overallRank = standings.findIndex((s) => s.teamId === bracket.championTeamId);
    conferenceChampions.push({ teamId: bracket.championTeamId, seed: overallRank + 1 });
  }

  const [champA, champB] = conferenceChampions;
  if (!champA || !champB) {
    throw new Error("simulateSeason: deux champions de conférence attendus pour les Finales");
  }
  const finals = runFinals(rng, champA, champB, (home, away, _rng, context) => playGame(home, away, context));

  return {
    regularSeasonGames,
    standings,
    playIn,
    conferenceBrackets,
    finals,
    championTeamId: finals.winnerTeamId,
    minutesByPlayer,
  };
}

// Réexport pratique pour top8Seeds si un consommateur externe veut reconstruire un bracket manuellement.
export { top8Seeds };
