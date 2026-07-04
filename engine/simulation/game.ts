/**
 * Simulation instantanée d'un match complet (spec-possession-algorithm.md §1, §10 ;
 * plan-développement §Phase 2 — Sessions 1-3). Depuis la Session 4, la boucle
 * pas-à-pas vit dans `gameEngine.ts` (`createGameEngine`), partagée avec le mode
 * match live (`liveGame.ts`) — ce module ne fait plus que : tirer la variance de
 * match par joueur (une fois, avant tout, pour préserver l'ordre des tirages RNG
 * et donc le hash golden master), construire le moteur, et boucler jusqu'à la fin.
 */
import { computeVarianceFactor } from "./mental.js";
import { createGameEngine, type SimulateGameOptions, type SimulatedGame } from "./gameEngine.js";
import type { RNG } from "../utils/rng.js";

export type { SimulateGameOptions, SimulatedGame } from "./gameEngine.js";
export { pickStartingFive } from "./gameEngine.js";

/** Simule un match complet, possession par possession, jusqu'à la fin du temps réglementaire ou des prolongations. */
export function simulateGame(rng: RNG, options: SimulateGameOptions): SimulatedGame {
  const variance: Record<string, number> = {};
  for (const p of options.homeRoster) variance[p.id] = computeVarianceFactor(p, rng);
  for (const p of options.awayRoster) variance[p.id] = computeVarianceFactor(p, rng);

  const engine = createGameEngine(rng, { ...options, variance });
  while (!engine.stepPossession()) {
    // La boucle avance jusqu'à la fin ; les interventions live (temps-mort,
    // substitution manuelle, tactique) sont réservées à `liveGame.ts`.
  }
  return engine.finalize();
}
