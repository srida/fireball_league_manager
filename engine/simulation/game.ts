/**
 * Boucle de match complète (spec-possession-algorithm.md §1, §10).
 * P1 : pas de rotations — les 5 majeurs jouent l'intégralité du match (modèle
 * de minutes "naïf" : personne ne sort, minutes = durée totale du match).
 * Un match est une suite de possessions alternées jusqu'à la fin du temps
 * réglementaire ou d'une prolongation (spec §1).
 */
import { PACE } from "../config/tuning.js";
import { resolvePossession } from "./possession.js";
import type { RNG } from "../utils/rng.js";
import type { Game, GameState, OnCourtPlayer, Player, Position, TeamSide } from "../types/index.js";

const STARTING_FIVE_POSITIONS: readonly Position[] = ["PG", "SG", "SF", "PF", "C"];

function playerRating(p: Player): number {
  const skillAvg = Object.values(p.skills).reduce((a, b) => a + b, 0) / Object.keys(p.skills).length;
  const physicalAvg = Object.values(p.physical).reduce((a, b) => a + b, 0) / Object.keys(p.physical).length;
  return skillAvg * 0.7 + physicalAvg * 0.3;
}

/**
 * Sélection naïve du 5 de départ (P1, spec §10 : "pas de rotations, hiérarchie
 * du roster prévue en P2"). Un joueur par poste primaire, le mieux noté ; à
 * défaut de candidat au poste, le meilleur joueur restant du roster.
 */
export function pickStartingFive(roster: readonly Player[]): Player[] {
  const used = new Set<string>();
  const five: Player[] = [];
  for (const position of STARTING_FIVE_POSITIONS) {
    const candidates = roster.filter((p) => !used.has(p.id) && p.position === position);
    const pool = candidates.length > 0 ? candidates : roster.filter((p) => !used.has(p.id));
    const best = [...pool].sort((a, b) => playerRating(b) - playerRating(a))[0] as Player;
    used.add(best.id);
    five.push(best);
  }
  return five;
}

function toOnCourt(player: Player): OnCourtPlayer {
  // P1 : seuls physical/skills sont actifs dans la simulation (spec-player-model §9).
  return { player, effective: { ...player.physical, ...player.skills } };
}

export interface SimulateGameOptions {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeRoster: readonly Player[];
  awayRoster: readonly Player[];
}

export interface SimulatedGame {
  game: Game;
  /** Nombre de possessions jouées par chaque équipe (invariant : égal à ±2 près). */
  possessionCount: Record<TeamSide, number>;
  /** Les 5 joueurs sur le terrain de chaque équipe (P1 : inchangés tout le match). */
  onCourt: Record<TeamSide, Player[]>;
  /** Minutes jouées par chaque joueur sur le terrain (modèle naïf, spec §10). */
  minutesPlayed: Record<string, number>;
}

/** Simule un match complet, possession par possession, jusqu'à la fin du temps réglementaire ou des prolongations. */
export function simulateGame(rng: RNG, options: SimulateGameOptions): SimulatedGame {
  const homeFive = pickStartingFive(options.homeRoster);
  const awayFive = pickStartingFive(options.awayRoster);

  const game: Game = {
    id: options.gameId,
    homeTeamId: options.homeTeamId,
    awayTeamId: options.awayTeamId,
    status: "IN_PROGRESS",
    homeScore: 0,
    awayScore: 0,
    quarter: 1,
    events: [],
  };

  let state: GameState = {
    game,
    clockSeconds: PACE.quarterDurationSeconds,
    quarter: 1,
    teamFouls: { HOME: 0, AWAY: 0 },
    possession: rng.bool(0.5) ? "HOME" : "AWAY",
    onCourt: { HOME: homeFive.map(toOnCourt), AWAY: awayFive.map(toOnCourt) },
    context: { homeTeamId: options.homeTeamId, awayTeamId: options.awayTeamId },
  };

  const possessionCount: Record<TeamSide, number> = { HOME: 0, AWAY: 0 };

  while (true) {
    while (state.clockSeconds > 0) {
      const offenseSide = state.possession;
      const result = resolvePossession(state, rng);

      game.events.push(...result.events);
      possessionCount[offenseSide]++;
      if (offenseSide === "HOME") game.homeScore += result.points;
      else game.awayScore += result.points;

      state = {
        ...state,
        clockSeconds: Math.max(0, state.clockSeconds - result.clockUsed),
        possession: result.nextPossession,
      };
    }

    const tied = game.homeScore === game.awayScore;
    const regulationOver = state.quarter >= 4;

    if (!regulationOver) {
      state = { ...state, quarter: state.quarter + 1, clockSeconds: PACE.quarterDurationSeconds, teamFouls: { HOME: 0, AWAY: 0 } };
      game.quarter = state.quarter;
      continue;
    }

    if (tied) {
      state = {
        ...state,
        quarter: state.quarter + 1,
        clockSeconds: PACE.overtimeDurationSeconds,
        teamFouls: { HOME: 0, AWAY: 0 },
      };
      game.quarter = state.quarter;
      continue;
    }

    break;
  }

  game.status = "FINAL";

  const totalGameSeconds =
    PACE.quarterDurationSeconds * 4 + Math.max(0, game.quarter - 4) * PACE.overtimeDurationSeconds;
  const starterMinutes = totalGameSeconds / 60;

  const minutesPlayed: Record<string, number> = {};
  for (const p of [...homeFive, ...awayFive]) minutesPlayed[p.id] = starterMinutes;

  return {
    game,
    possessionCount,
    onCourt: { HOME: homeFive, AWAY: awayFive },
    minutesPlayed,
  };
}
