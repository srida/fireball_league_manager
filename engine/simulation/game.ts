/**
 * Boucle de match complète (spec-possession-algorithm.md §1, §10 ; plan-développement
 * §Phase 2 — Sessions 1 et 2). Rotations réelles — la hiérarchie du roster et les
 * minutes cibles pilotent un moteur de substitutions automatique vérifié après
 * chaque possession, avec gestion des 6 fautes personnelles (foul-out immédiat).
 * Session 2 : fatigue intra-match (`gameStamina`, drainée/récupérée à chaque
 * possession) et blessures probabilistes (sortie forcée définitive, comme le
 * foul-out) — la persistance inter-matchs (fitness, durée d'indisponibilité)
 * est de la responsabilité de l'appelant (season.ts), ce module reste pur.
 * Un match est une suite de possessions alternées jusqu'à la fin du temps
 * réglementaire ou d'une prolongation (spec §1).
 */
import { PACE } from "../config/tuning.js";
import { applyFatigueDrain, checkInjuries } from "./fatigue.js";
import { resolvePossession } from "./possession.js";
import { buildRotationPlan, createGameRotationState, decideSubstitutions, playerRating } from "./rotation.js";
import type { RNG } from "../utils/rng.js";
import type {
  Game,
  GameState,
  InjurySeverity,
  OnCourtPlayer,
  Player,
  Position,
  TeamSide,
  TeamTactics,
} from "../types/index.js";

const STARTING_FIVE_POSITIONS: readonly Position[] = ["PG", "SG", "SF", "PF", "C"];

/**
 * Sélection du 5 de départ : un joueur par poste primaire, le mieux noté ; à
 * défaut de candidat au poste, le meilleur joueur restant du roster. Reprend
 * la hiérarchie de rotation (spec plan P2 §Session 1) pour rester cohérente
 * avec les décisions de substitution en cours de match.
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
  // P1/P2 : seuls physical/skills sont actifs dans la simulation (spec-player-model §9).
  return { player, effective: { ...player.physical, ...player.skills } };
}

export interface SimulateGameOptions {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeRoster: readonly Player[];
  awayRoster: readonly Player[];
  homeTactics: TeamTactics;
  awayTactics: TeamTactics;
  /**
   * gameStamina de départ par joueur (0-100), dérivée de la fitness saison
   * (season.ts, plan P2 §Session 2). Un joueur absent de la map démarre à 100
   * (défaut utilisé par les tests unitaires/propriétés, cohérent avec P1).
   */
  homeStartingFitness?: Readonly<Record<string, number>>;
  awayStartingFitness?: Readonly<Record<string, number>>;
}

export interface SimulatedGame {
  game: Game;
  /** Nombre de possessions jouées par chaque équipe (invariant : égal à ±2 près). */
  possessionCount: Record<TeamSide, number>;
  /** Les 5 joueurs qui ont débuté le match pour chaque équipe. */
  startingFive: Record<TeamSide, Player[]>;
  /** Tous les joueurs ayant foulé le parquet (titulaires + entrants, spec plan P2 §Session 1). */
  participants: Record<TeamSide, Player[]>;
  /** Minutes réellement jouées par chaque joueur (dérivées des substitutions, spec §Session 1). */
  minutesPlayed: Record<string, number>;
  /** Blessures survenues pendant ce match (plan P2 §Session 2), à répercuter sur la saison par l'appelant. */
  injuries: { playerId: string; side: TeamSide; severity: InjurySeverity; gamesOut: number }[];
}

/** Simule un match complet, possession par possession, jusqu'à la fin du temps réglementaire ou des prolongations. */
export function simulateGame(rng: RNG, options: SimulateGameOptions): SimulatedGame {
  const homeFive = pickStartingFive(options.homeRoster);
  const awayFive = pickStartingFive(options.awayRoster);

  const homeRosterById = new Map(options.homeRoster.map((p) => [p.id, p]));
  const awayRosterById = new Map(options.awayRoster.map((p) => [p.id, p]));

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

  const gameStamina: Record<string, number> = {};
  for (const p of options.homeRoster) gameStamina[p.id] = options.homeStartingFitness?.[p.id] ?? 100;
  for (const p of options.awayRoster) gameStamina[p.id] = options.awayStartingFitness?.[p.id] ?? 100;

  let state: GameState = {
    game,
    clockSeconds: PACE.quarterDurationSeconds,
    quarter: 1,
    teamFouls: { HOME: 0, AWAY: 0 },
    personalFouls: {},
    possession: rng.bool(0.5) ? "HOME" : "AWAY",
    onCourt: { HOME: homeFive.map(toOnCourt), AWAY: awayFive.map(toOnCourt) },
    tactics: { HOME: options.homeTactics, AWAY: options.awayTactics },
    rotation: {
      HOME: createGameRotationState(buildRotationPlan(options.homeRoster)),
      AWAY: createGameRotationState(buildRotationPlan(options.awayRoster)),
    },
    gameStamina,
    injuries: {},
    context: { homeTeamId: options.homeTeamId, awayTeamId: options.awayTeamId },
  };

  const rosterBySide = { HOME: options.homeRoster, AWAY: options.awayRoster } as const;
  const injuries: SimulatedGame["injuries"] = [];

  const possessionCount: Record<TeamSide, number> = { HOME: 0, AWAY: 0 };
  const participantIds: Record<TeamSide, Set<string>> = { HOME: new Set(), AWAY: new Set() };
  for (const p of homeFive) participantIds.HOME.add(p.id);
  for (const p of awayFive) participantIds.AWAY.add(p.id);

  function applyElapsedTime(clockUsed: number): void {
    for (const side of ["HOME", "AWAY"] as const) {
      const cumulative = state.rotation[side].cumulativeSeconds;
      for (const oc of state.onCourt[side]) {
        cumulative[oc.player.id] = (cumulative[oc.player.id] ?? 0) + clockUsed;
      }
    }
    applyFatigueDrain(state, rosterBySide, clockUsed);
  }

  function applySubstitutions(clock: number): void {
    const rostersBySide = { HOME: homeRosterById, AWAY: awayRosterById } as const;
    for (const side of ["HOME", "AWAY"] as const) {
      const outcome = decideSubstitutions(state, side, clock, rostersBySide[side]);
      if (outcome.events.length === 0) continue;
      game.events.push(...outcome.events);
      for (const oc of outcome.onCourt) participantIds[side].add(oc.player.id);
      state = { ...state, onCourt: { ...state.onCourt, [side]: outcome.onCourt } };
    }
  }

  while (true) {
    while (state.clockSeconds > 0) {
      const offenseSide = state.possession;
      const result = resolvePossession(state, rng);

      game.events.push(...result.events);
      possessionCount[offenseSide]++;
      if (offenseSide === "HOME") game.homeScore += result.points;
      else game.awayScore += result.points;

      applyElapsedTime(result.clockUsed);

      const personalFouls = { ...state.personalFouls };
      for (const event of result.events) {
        if (event.t === "FOUL") personalFouls[event.player] = (personalFouls[event.player] ?? 0) + 1;
      }

      const nextClock = Math.max(0, state.clockSeconds - result.clockUsed);
      state = {
        ...state,
        clockSeconds: nextClock,
        possession: result.nextPossession,
        personalFouls,
      };

      const injuryCheck = checkInjuries(state, rng, nextClock);
      if (injuryCheck.events.length > 0) {
        game.events.push(...injuryCheck.events);
        for (const [playerId, injury] of Object.entries(injuryCheck.newInjuries)) {
          const side: TeamSide = homeRosterById.has(playerId) ? "HOME" : "AWAY";
          injuries.push({ playerId, side, severity: injury.severity, gamesOut: injury.gamesOut });
        }
        state = { ...state, injuries: { ...state.injuries, ...injuryCheck.newInjuries } };
      }

      applySubstitutions(nextClock);
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

  const minutesPlayed: Record<string, number> = {};
  for (const side of ["HOME", "AWAY"] as const) {
    for (const [playerId, seconds] of Object.entries(state.rotation[side].cumulativeSeconds)) {
      minutesPlayed[playerId] = seconds / 60;
    }
  }

  const participants = {
    HOME: [...participantIds.HOME].map((id) => homeRosterById.get(id)).filter((p): p is Player => p !== undefined),
    AWAY: [...participantIds.AWAY].map((id) => awayRosterById.get(id)).filter((p): p is Player => p !== undefined),
  };

  return {
    game,
    possessionCount,
    startingFive: { HOME: homeFive, AWAY: awayFive },
    participants,
    minutesPlayed,
    injuries,
  };
}
