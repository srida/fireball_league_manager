/**
 * Disponibilité joueur inter-matchs (fitness/blessures/back-to-back, plan P2
 * §Session 2/4) — extrait de `season.ts` pour être réutilisé par un pilotage de
 * saison pas-à-pas (`seasonRunner.ts`, consommé par l'UI "coach mode") sans
 * dupliquer la règle (CLAUDE.md — "une source de vérité par règle"). `season.ts`
 * garde exactement le même comportement en s'appuyant sur ce driver.
 */
import { FATIGUE } from "../config/tuning.js";
import { effectiveInjuryGamesOut } from "../simulation/mental.js";
import type { SimulateGameOptions, SimulatedGame } from "../simulation/gameEngine.js";
import type { RNG } from "../utils/rng.js";
import type { GameContextInfo, Player, Team } from "../types/index.js";

const REGULAR_SEASON_CONTEXT: GameContextInfo = {
  gameTier: "REGULAR_SEASON",
  isEliminationGame: false,
  isGame7: false,
};

interface PlayerAvailability {
  fitness: number;
  injuryGamesRemaining: number;
}

export interface GameDriver {
  /** Prépare les rosters disponibles (fitness, blessures décomptées) pour un match, sans le jouer. */
  prepare(
    rng: RNG,
    homeTeamId: string,
    awayTeamId: string,
    context?: GameContextInfo,
    gameDate?: string,
  ): SimulateGameOptions;
  /** Répercute les effets d'un match joué (usure, blessures, dernière date jouée) sur l'état de saison. */
  commit(homeTeamId: string, awayTeamId: string, simulated: SimulatedGame, gameDate?: string): void;
  getAvailability(playerId: string): Readonly<PlayerAvailability>;
  /** Vrai si `teamId` a joué le jour calendaire précédent `gameDate` (plan P2 §Session 4 — repos réel). */
  isBackToBack(teamId: string, gameDate: string | undefined): boolean;
}

function daysBetween(isoA: string, isoB: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${isoB}T00:00:00.000Z`) - Date.parse(`${isoA}T00:00:00.000Z`)) / msPerDay);
}

export function createGameDriver(teamById: ReadonlyMap<string, Team>): GameDriver {
  const playerById = new Map<string, Player>();
  for (const team of teamById.values()) {
    for (const player of team.roster) playerById.set(player.id, player);
  }

  const availability = new Map<string, PlayerAvailability>();
  const getAvailability = (playerId: string): PlayerAvailability => {
    let a = availability.get(playerId);
    if (!a) {
      a = { fitness: 100, injuryGamesRemaining: 0 };
      availability.set(playerId, a);
    }
    return a;
  };

  const lastPlayedDate = new Map<string, string>();

  function isBackToBack(teamId: string, gameDate: string | undefined): boolean {
    if (!gameDate) return false;
    const previous = lastPlayedDate.get(teamId);
    return previous !== undefined && daysBetween(previous, gameDate) === 1;
  }

  function prepareRoster(team: Team, backToBack: boolean): { roster: Player[]; startingFitness: Record<string, number> } {
    const roster: Player[] = [];
    const startingFitness: Record<string, number> = {};
    const recovery = backToBack ? FATIGUE.backToBackRecovery : FATIGUE.restRecovery;

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

  return {
    prepare(rng, homeTeamId, awayTeamId, context = REGULAR_SEASON_CONTEXT, gameDate) {
      const home = teamById.get(homeTeamId) as Team;
      const away = teamById.get(awayTeamId) as Team;
      const homePrep = prepareRoster(home, isBackToBack(homeTeamId, gameDate));
      const awayPrep = prepareRoster(away, isBackToBack(awayTeamId, gameDate));

      return {
        gameId: `${homeTeamId}-vs-${awayTeamId}-${rng.int(0, 1_000_000_000)}`,
        homeTeamId,
        awayTeamId,
        homeRoster: homePrep.roster,
        awayRoster: awayPrep.roster,
        homeTactics: home.tactics,
        awayTactics: away.tactics,
        homeStartingFitness: homePrep.startingFitness,
        awayStartingFitness: awayPrep.startingFitness,
        context,
      };
    },

    commit(homeTeamId, awayTeamId, simulated, gameDate) {
      if (gameDate) {
        lastPlayedDate.set(homeTeamId, gameDate);
        lastPlayedDate.set(awayTeamId, gameDate);
      }

      for (const [playerId, minutes] of Object.entries(simulated.minutesPlayed)) {
        const a = getAvailability(playerId);
        a.fitness = Math.max(0, a.fitness - minutes * FATIGUE.fitnessWearPerMinute);
      }
      for (const injury of simulated.injuries) {
        const player = playerById.get(injury.playerId);
        const gamesOut = player ? effectiveInjuryGamesOut(player, injury.gamesOut) : injury.gamesOut;
        getAvailability(injury.playerId).injuryGamesRemaining = gamesOut;
      }
    },

    getAvailability(playerId) {
      return getAvailability(playerId);
    },

    isBackToBack,
  };
}
