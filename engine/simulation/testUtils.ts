/**
 * Utilitaires de test pour le moteur de possession — permettent de forcer
 * précisément chaque branche de la machine à états (spec-tests-phase1.md §1
 * "Résolution d'une possession (avec RNG mocké/forcé)").
 * Non utilisé par le moteur lui-même, uniquement par les tests.
 */
import { createRng, type RNG } from "../utils/rng.js";
import { generatePlayer } from "../generation/player.js";
import type { GameState, OnCourtPlayer, Player, Position, TeamSide } from "../types/index.js";

/**
 * RNG scriptable : chaque méthode consomme une valeur programmée dans une file
 * si disponible, sinon retombe sur un RNG seedé réel (pour les tirages non
 * pertinents au scénario testé, ex. le temps d'horloge exact).
 */
export class ScriptedRng implements RNG {
  private readonly fallback: RNG;
  private nextQueue: number[] = [];
  private boolQueue: boolean[] = [];
  private weightedPickQueue: unknown[] = [];
  private pickQueue: unknown[] = [];

  constructor(seed: string | number = "scripted-rng") {
    this.fallback = createRng(seed);
  }

  queueNext(...values: number[]): this {
    this.nextQueue.push(...values);
    return this;
  }

  queueBool(...values: boolean[]): this {
    this.boolQueue.push(...values);
    return this;
  }

  /** Force le prochain résultat de `weightedPick`/`pick`, quel que soit l'item réellement pondéré le plus haut. */
  queuePick<T>(...values: T[]): this {
    this.weightedPickQueue.push(...values);
    this.pickQueue.push(...values);
    return this;
  }

  next(): number {
    return this.nextQueue.shift() ?? this.fallback.next();
  }

  int(min: number, max: number): number {
    return this.fallback.int(min, max);
  }

  float(min: number, max: number): number {
    return this.fallback.float(min, max);
  }

  bool(pTrue = 0.5): boolean {
    if (this.boolQueue.length > 0) return this.boolQueue.shift() as boolean;
    return this.fallback.bool(pTrue);
  }

  gaussian(mean: number, stdDev: number, min?: number, max?: number): number {
    return this.fallback.gaussian(mean, stdDev, min, max);
  }

  pick<T>(items: readonly T[]): T {
    if (this.pickQueue.length > 0) return this.pickQueue.shift() as T;
    return this.fallback.pick(items);
  }

  weightedPick<T>(items: readonly { item: T; weight: number }[]): T {
    if (this.weightedPickQueue.length > 0) {
      const forced = this.weightedPickQueue.shift();
      const match = items.find((entry) => entry.item === forced);
      if (match) return match.item;
      // La valeur forcée ne fait pas partie de ce tirage précis (ex. forcée pour
      // un tirage plus loin dans la séquence) : on retombe sur le fallback.
      this.weightedPickQueue.unshift(forced);
    }
    return this.fallback.weightedPick(items);
  }
}

const POSITIONS: readonly Position[] = ["PG", "SG", "SF", "PF", "C"];
const ARCHETYPE_BY_POSITION: Record<Position, Parameters<typeof generatePlayer>[1]> = {
  PG: "PLAYMAKER_PG",
  SG: "THREE_AND_D",
  SF: "TWO_WAY_WING",
  PF: "STRETCH_FOUR",
  C: "RIM_PROTECTOR",
};

/** Génère 5 joueurs (un par poste) pour composer un 5 majeur de test. */
export function makeFive(seed: string): Player[] {
  const rng = createRng(seed);
  return POSITIONS.map((position) => generatePlayer(rng, ARCHETYPE_BY_POSITION[position], position));
}

/** Force tous les attributs `skills`/`physical` d'un joueur à une valeur unique (tests de bornes). */
export function withFlatAttributes(player: Player, value: number): Player {
  const flatSkills = Object.fromEntries(
    Object.keys(player.skills).map((k) => [k, value]),
  ) as unknown as Player["skills"];
  const flatPhysical = Object.fromEntries(
    Object.keys(player.physical).map((k) => [k, value]),
  ) as unknown as Player["physical"];
  return { ...player, skills: flatSkills, physical: flatPhysical };
}

export function toOnCourt(player: Player): OnCourtPlayer {
  return { player, effective: { ...player.physical, ...player.skills } };
}

export function makeGameState(homeFive: Player[], awayFive: Player[], overrides?: Partial<GameState>): GameState {
  return {
    game: {
      id: "test-game",
      homeTeamId: "home",
      awayTeamId: "away",
      status: "IN_PROGRESS",
      homeScore: 0,
      awayScore: 0,
      quarter: 1,
      events: [],
    },
    clockSeconds: 720,
    quarter: 1,
    teamFouls: { HOME: 0, AWAY: 0 },
    possession: "HOME" as TeamSide,
    onCourt: { HOME: homeFive.map(toOnCourt), AWAY: awayFive.map(toOnCourt) },
    context: { homeTeamId: "home", awayTeamId: "away" },
    ...overrides,
  };
}
