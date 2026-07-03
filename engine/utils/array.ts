import type { RNG } from "./rng.js";

/** Fisher-Yates, pilotée par le RNG injecté (jamais Math.random). */
export function shuffle<T>(rng: RNG, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}
