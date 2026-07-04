/**
 * Cœur pas-à-pas de la boucle de match (spec-possession-algorithm.md §1, §10 ;
 * plan-développement §Phase 2 — Sessions 1-3), extrait de `game.ts` en Session 4
 * pour servir à la fois la simulation instantanée (`simulateGame`, qui boucle
 * `stepPossession()` jusqu'à la fin) et le mode match live (`liveGame.ts`, qui
 * appelle `stepPossession()` un coup à la fois et peut intervenir entre deux
 * appels via `callTimeout`/`substitute`/`setTactics`).
 *
 * Extraction mécanique : la logique de `stepPossession()` est identique à
 * l'ancien corps de boucle de `simulateGame` (P1-Session 3), aucun nouvel
 * appel RNG n'a été introduit — le hash golden master ne doit pas changer
 * pour une saison qui n'utilise pas les interventions live.
 */
import { PACE, TIMEOUT } from "../config/tuning.js";
import { applyFatigueDrain, checkInjuries } from "./fatigue.js";
import { applyVarianceToSkills } from "./mental.js";
import { resolvePossession } from "./possession.js";
import { buildRotationPlan, createGameRotationState, decideSubstitutions, playerRating } from "./rotation.js";
import type { RNG } from "../utils/rng.js";
import type {
  Event,
  Game,
  GameContextInfo,
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

function toOnCourt(player: Player, varianceFactor: number): OnCourtPlayer {
  // P1/P2 : seuls physical/skills sont actifs dans la simulation (spec-player-model §9).
  // P2 Session 3 : variance de performance par match (métronome/erratique) appliquée aux skills.
  return { player, effective: { ...player.physical, ...applyVarianceToSkills(player.skills, varianceFactor) } };
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
  /**
   * Enjeu du match (plan P2 §Session 3 : gameTier/élimination/game 7), fourni par
   * season.ts. Défaut : saison régulière sans enjeu particulier (tests unitaires/
   * propriétés, cohérent avec P1/Session 1-2 où le contexte n'existait pas).
   */
  context?: GameContextInfo;
  /**
   * Nombre de joueurs de départ pré-tirés (variance de match, plan P2 §Session 3)
   * — fourni par `precomputeVariance`, séparé pour que `simulateGame` et
   * `LiveGameSession` (mode live) partagent le même tirage RNG.
   */
  variance?: Readonly<Record<string, number>>;
}

const DEFAULT_GAME_CONTEXT: GameContextInfo = {
  gameTier: "REGULAR_SEASON",
  isEliminationGame: false,
  isGame7: false,
};

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

export interface GameEngine {
  readonly game: Game;
  getState(): GameState;
  /** Avance d'une possession (ou d'une transition de quart-temps). Renvoie true si le match est terminé après cet appel. */
  stepPossession(): boolean;
  /** Snapshot final — appelable à tout moment (avant la fin pour une inspection live, ou après pour le résultat). */
  finalize(): SimulatedGame;
  /** Mode match live (plan P2 §Session 4) : temps-mort, récupération de fatigue + fenêtre d'intervention libre. */
  callTimeout(side: TeamSide): boolean;
  getTimeoutsRemaining(side: TeamSide): number;
  /** Mode match live : substitution manuelle, en dehors du moteur de rotation automatique. */
  substitute(side: TeamSide, outPlayerId: string, inPlayerId: string): Event | undefined;
  /** Mode match live : changement tactique à chaud. */
  setTactics(side: TeamSide, tactics: TeamTactics): void;
}

/** Construit le moteur de match pas-à-pas (plan P2 §Session 4). */
export function createGameEngine(rng: RNG, options: SimulateGameOptions): GameEngine {
  const variance = options.variance ?? {};

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
    onCourt: {
      HOME: homeFive.map((p) => toOnCourt(p, variance[p.id] ?? 1)),
      AWAY: awayFive.map((p) => toOnCourt(p, variance[p.id] ?? 1)),
    },
    tactics: { HOME: options.homeTactics, AWAY: options.awayTactics },
    rotation: {
      HOME: createGameRotationState(buildRotationPlan(options.homeRoster)),
      AWAY: createGameRotationState(buildRotationPlan(options.awayRoster)),
    },
    gameStamina,
    injuries: {},
    variance,
    context: {
      homeTeamId: options.homeTeamId,
      awayTeamId: options.awayTeamId,
      ...(options.context ?? DEFAULT_GAME_CONTEXT),
    },
  };

  const rosterBySide = { HOME: options.homeRoster, AWAY: options.awayRoster } as const;
  const injuries: SimulatedGame["injuries"] = [];

  const possessionCount: Record<TeamSide, number> = { HOME: 0, AWAY: 0 };
  const participantIds: Record<TeamSide, Set<string>> = { HOME: new Set(), AWAY: new Set() };
  for (const p of homeFive) participantIds.HOME.add(p.id);
  for (const p of awayFive) participantIds.AWAY.add(p.id);

  const timeoutsRemaining: Record<TeamSide, number> = { HOME: TIMEOUT.perTeamPerGame, AWAY: TIMEOUT.perTeamPerGame };

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

  function stepPossession(): boolean {
    if (state.clockSeconds > 0) {
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
      return false;
    }

    const tied = game.homeScore === game.awayScore;
    const regulationOver = state.quarter >= 4;

    if (!regulationOver) {
      state = { ...state, quarter: state.quarter + 1, clockSeconds: PACE.quarterDurationSeconds, teamFouls: { HOME: 0, AWAY: 0 } };
      game.quarter = state.quarter;
      return false;
    }

    if (tied) {
      state = {
        ...state,
        quarter: state.quarter + 1,
        clockSeconds: PACE.overtimeDurationSeconds,
        teamFouls: { HOME: 0, AWAY: 0 },
      };
      game.quarter = state.quarter;
      return false;
    }

    game.status = "FINAL";
    return true;
  }

  function finalize(): SimulatedGame {
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

  /** Mode match live (plan P2 §Session 4) : décision produit — petite récupération de fatigue + fenêtre d'intervention libre. */
  function callTimeout(side: TeamSide): boolean {
    if (timeoutsRemaining[side] <= 0) return false;
    timeoutsRemaining[side]--;
    const nextGameStamina = { ...state.gameStamina };
    for (const oc of state.onCourt[side]) {
      nextGameStamina[oc.player.id] = Math.min(100, (nextGameStamina[oc.player.id] ?? 100) + TIMEOUT.staminaRecovery);
    }
    state = { ...state, gameStamina: nextGameStamina };
    const event: Event = { t: "TIMEOUT", side, clock: state.clockSeconds };
    game.events.push(event);
    return true;
  }

  function getTimeoutsRemaining(side: TeamSide): number {
    return timeoutsRemaining[side];
  }

  /**
   * Substitution manuelle (plan P2 §Session 4) : le GM peut faire entrer/sortir
   * un joueur en dehors du moteur automatique (rotation.ts). Renvoie l'événement
   * `SUB` produit, ou `undefined` si la substitution est invalide (joueur absent
   * du terrain, entrant blessé/déjà sur le terrain/hors roster).
   */
  function substitute(side: TeamSide, outPlayerId: string, inPlayerId: string): Event | undefined {
    const onCourt = state.onCourt[side];
    if (!onCourt.some((oc) => oc.player.id === outPlayerId)) return undefined;
    if (onCourt.some((oc) => oc.player.id === inPlayerId)) return undefined;
    if (inPlayerId in state.injuries) return undefined;

    const rostersBySide = { HOME: homeRosterById, AWAY: awayRosterById } as const;
    const incomingPlayer = rostersBySide[side].get(inPlayerId);
    if (!incomingPlayer) return undefined;

    const varianceFactor = state.variance[inPlayerId] ?? 1;
    const incoming: OnCourtPlayer = toOnCourt(incomingPlayer, varianceFactor);

    const nextOnCourt = onCourt.map((oc) => (oc.player.id === outPlayerId ? incoming : oc));
    state.rotation[side].stintStartSeconds[inPlayerId] = elapsedSeconds();
    state = { ...state, onCourt: { ...state.onCourt, [side]: nextOnCourt } };
    participantIds[side].add(inPlayerId);

    const event: Event = { t: "SUB", in: inPlayerId, out: outPlayerId, clock: state.clockSeconds };
    game.events.push(event);
    return event;
  }

  function elapsedSeconds(): number {
    const quarterIndex = Math.min(state.quarter, 4) - 1;
    const regulationElapsed = quarterIndex * PACE.quarterDurationSeconds + (PACE.quarterDurationSeconds - state.clockSeconds);
    if (state.quarter <= 4) return regulationElapsed;
    const otElapsed = (state.quarter - 4 - 1) * PACE.overtimeDurationSeconds + (PACE.overtimeDurationSeconds - state.clockSeconds);
    return 4 * PACE.quarterDurationSeconds + otElapsed;
  }

  function setTactics(side: TeamSide, tactics: TeamTactics): void {
    state = { ...state, tactics: { ...state.tactics, [side]: tactics } };
  }

  return {
    game,
    getState: () => state,
    stepPossession,
    finalize,
    callTimeout,
    getTimeoutsRemaining,
    substitute,
    setTactics,
  };
}
