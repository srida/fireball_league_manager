/**
 * Orchestrateur de saison complète — relie calendrier, simulation de match,
 * classement, play-in et playoffs (CLAUDE.md boucle annuelle). Utilisé par
 * le harnais batch (Session D) et par les tests d'intégration de bout en bout.
 */
import { generateSchedule } from "./schedule.js";
import { computeStandings, standingsForConference, type TeamStanding } from "./standings.js";
import { runConferenceBracket, runFinals, runPlayIn, type BracketResult, type SeriesResult } from "./playoffs.js";
import { simulateGame } from "../simulation/game.js";
import type { RNG } from "../utils/rng.js";
import type { Event, Game, League, Team } from "../types/index.js";

export interface SeasonResult {
  regularSeasonGames: Game[];
  standings: TeamStanding[];
  playIn: Record<string, { seventhSeedTeamId: string; eighthSeedTeamId: string }>;
  conferenceBrackets: Record<string, BracketResult>;
  finals: SeriesResult;
  championTeamId: string;
}

interface RealGameResult {
  homeScore: number;
  awayScore: number;
  events: Event[];
}

/** Simule un match unique via le moteur de possession réel (spec-possession-algorithm.md). */
function playRealGame(rng: RNG, teamById: Map<string, Team>) {
  return (homeTeamId: string, awayTeamId: string): RealGameResult => {
    const home = teamById.get(homeTeamId) as Team;
    const away = teamById.get(awayTeamId) as Team;
    const { game } = simulateGame(rng, {
      gameId: `${homeTeamId}-vs-${awayTeamId}-${rng.int(0, 1_000_000_000)}`,
      homeTeamId,
      awayTeamId,
      homeRoster: home.roster,
      awayRoster: away.roster,
      homeTactics: home.tactics,
      awayTactics: away.tactics,
    });
    return { homeScore: game.homeScore, awayScore: game.awayScore, events: game.events };
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

  const regularSeasonGames: Game[] = fixtures.map((f, i) => {
    const result = playGame(f.homeTeamId, f.awayTeamId);
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
      (home, away) => playGame(home, away),
    );
    playIn[conference] = playInResult;

    const top8 = [
      ...top6,
      { teamId: playInResult.seventhSeedTeamId, seed: 7 },
      { teamId: playInResult.eighthSeedTeamId, seed: 8 },
    ];

    const bracket = runConferenceBracket(rng, top8, (home, away) => playGame(home, away));
    conferenceBrackets[conference] = bracket;

    const overallRank = standings.findIndex((s) => s.teamId === bracket.championTeamId);
    conferenceChampions.push({ teamId: bracket.championTeamId, seed: overallRank + 1 });
  }

  const [champA, champB] = conferenceChampions;
  if (!champA || !champB) {
    throw new Error("simulateSeason: deux champions de conférence attendus pour les Finales");
  }
  const finals = runFinals(rng, champA, champB, (home, away) => playGame(home, away));

  return {
    regularSeasonGames,
    standings,
    playIn,
    conferenceBrackets,
    finals,
    championTeamId: finals.winnerTeamId,
  };
}

// Réexport pratique pour top8Seeds si un consommateur externe veut reconstruire un bracket manuellement.
export { top8Seeds };
