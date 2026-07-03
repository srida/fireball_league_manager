/**
 * Orchestrateur de saison complète — relie calendrier, simulation de match,
 * classement, play-in et playoffs (CLAUDE.md boucle annuelle). Utilisé par
 * le harnais batch (Session D) et par les tests d'intégration de bout en bout.
 */
import { FATIGUE } from "../config/tuning.js";
import { generateSchedule } from "./schedule.js";
import { computeStandings, standingsForConference, type TeamStanding } from "./standings.js";
import { runConferenceBracket, runFinals, runPlayIn, type BracketResult, type SeriesResult } from "./playoffs.js";
import { simulateGame } from "../simulation/game.js";
import type { RNG } from "../utils/rng.js";
import type { Event, Game, League, Player, Team } from "../types/index.js";

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

/**
 * Disponibilité d'un joueur à l'échelle de la saison (plan P2 §Session 2) :
 * `fitness` persiste entre les matchs (contrairement à `gameStamina`, remis à
 * niveau à chaque match par simulateGame) ; `injuryGamesRemaining` décompte
 * les matchs d'indisponibilité restants après une blessure.
 */
interface PlayerAvailability {
  fitness: number;
  injuryGamesRemaining: number;
}

/**
 * Simule un match unique via le moteur de possession réel (spec-possession-algorithm.md).
 * Possède l'état de fatigue/blessure inter-matchs (plan P2 §Session 2) : le
 * moteur de possession (`simulateGame`) reste pur, cette fermeture est la
 * seule couche qui fait persister `fitness`/blessures d'un match au suivant,
 * pour la saison régulière comme pour le play-in et les playoffs (même
 * fermeture réutilisée par tout `simulateSeason`).
 */
function playRealGame(rng: RNG, teamById: Map<string, Team>) {
  const availability = new Map<string, PlayerAvailability>();
  const getAvailability = (playerId: string): PlayerAvailability => {
    let a = availability.get(playerId);
    if (!a) {
      a = { fitness: 100, injuryGamesRemaining: 0 };
      availability.set(playerId, a);
    }
    return a;
  };

  /**
   * Prépare le roster disponible d'une équipe avant un match : récupération de
   * fitness selon le repos (proxy stochastique back-to-back, docs/decisions.md
   * "Modèle de repos inter-matchs"), décompte des blessures en cours, exclusion
   * des joueurs toujours indisponibles.
   */
  function prepareRoster(team: Team, isBackToBack: boolean): { roster: Player[]; startingFitness: Record<string, number> } {
    const roster: Player[] = [];
    const startingFitness: Record<string, number> = {};
    const recovery = isBackToBack ? FATIGUE.backToBackRecovery : FATIGUE.restRecovery;

    for (const player of team.roster) {
      const a = getAvailability(player.id);
      a.fitness = Math.min(100, a.fitness + recovery);
      if (a.injuryGamesRemaining > 0) a.injuryGamesRemaining -= 1;
      if (a.injuryGamesRemaining <= 0) {
        roster.push(player);
        startingFitness[player.id] = a.fitness;
      }
    }
    return { roster, startingFitness };
  }

  return (homeTeamId: string, awayTeamId: string): RealGameResult => {
    const home = teamById.get(homeTeamId) as Team;
    const away = teamById.get(awayTeamId) as Team;

    const homePrep = prepareRoster(home, rng.bool(FATIGUE.backToBackRate));
    const awayPrep = prepareRoster(away, rng.bool(FATIGUE.backToBackRate));

    const { game, minutesPlayed, injuries } = simulateGame(rng, {
      gameId: `${homeTeamId}-vs-${awayTeamId}-${rng.int(0, 1_000_000_000)}`,
      homeTeamId,
      awayTeamId,
      homeRoster: homePrep.roster,
      awayRoster: awayPrep.roster,
      homeTactics: home.tactics,
      awayTactics: away.tactics,
      homeStartingFitness: homePrep.startingFitness,
      awayStartingFitness: awayPrep.startingFitness,
    });

    for (const [playerId, minutes] of Object.entries(minutesPlayed)) {
      const a = getAvailability(playerId);
      a.fitness = Math.max(0, a.fitness - minutes * FATIGUE.fitnessWearPerMinute);
    }
    for (const injury of injuries) {
      getAvailability(injury.playerId).injuryGamesRemaining = injury.gamesOut;
    }

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
