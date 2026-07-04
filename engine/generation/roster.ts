import type { RNG } from "../utils/rng.js";
import { ARCHETYPE_POSITIONS, LEAGUE_GENERATION, PLAYER_GENERATION } from "../config/tuning.js";
import { POSITIONS, type ArchetypeId, type Player, type Position } from "../types/index.js";
import { generatePlayer } from "./player.js";

export function archetypesForPosition(position: Position): ArchetypeId[] {
  return (Object.keys(ARCHETYPE_POSITIONS) as ArchetypeId[]).filter((archetype) =>
    ARCHETYPE_POSITIONS[archetype].includes(position),
  );
}

/** Assigne des numéros de maillot uniques (0-99) à l'ensemble d'un roster. */
function assignJerseyNumbers(rng: RNG, players: Player[]): void {
  const used = new Set<number>();
  for (const player of players) {
    let number: number;
    do {
      number = rng.int(PLAYER_GENERATION.jerseyNumber.min, PLAYER_GENERATION.jerseyNumber.max);
    } while (used.has(number));
    used.add(number);
    player.jerseyNumber = number;
  }
}

/**
 * Tire un numéro de maillot libre (0-99) pour un joueur rejoignant `existing`
 * (remplaçant d'intersaison, rookie drafté) — même règle que la génération
 * initiale d'un roster (`assignJerseyNumbers`), réutilisée partout où un seul
 * joueur s'ajoute à un roster déjà constitué.
 */
export function pickFreeJerseyNumber(rng: RNG, existing: readonly Player[]): number {
  const used = new Set(existing.map((p) => p.jerseyNumber));
  let number: number;
  do {
    number = rng.int(PLAYER_GENERATION.jerseyNumber.min, PLAYER_GENERATION.jerseyNumber.max);
  } while (used.has(number));
  return number;
}

/**
 * Génère un roster de 15 joueurs : répartition simplifiée P1 de
 * `playersPerPositionOnRoster` joueurs par poste primaire (spec-player-model §8 —
 * archétype choisi parmi ceux compatibles avec le poste à pourvoir).
 */
export function generateRoster(rng: RNG): Player[] {
  const players: Player[] = [];
  for (const position of POSITIONS) {
    const candidates = archetypesForPosition(position);
    for (let i = 0; i < LEAGUE_GENERATION.playersPerPositionOnRoster; i++) {
      const archetypeId = rng.pick(candidates);
      players.push(generatePlayer(rng, archetypeId, position));
    }
  }
  assignJerseyNumbers(rng, players);
  return players;
}
