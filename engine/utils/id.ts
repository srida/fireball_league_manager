import type { RNG } from "./rng.js";

const HEX = "0123456789abcdef";

/**
 * Identifiant façon UUID v4, entièrement dérivé du RNG injecté.
 * `crypto.randomUUID()` casserait la reproductibilité seed → même résultat
 * (CLAUDE.md — "Une même seed doit produire exactement la même ligue").
 */
export function generateId(rng: RNG): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => HEX[rng.int(0, 15)]).join("");
  const variant = HEX[8 + rng.int(0, 3)]; // 8, 9, a ou b (variant RFC 4122)
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}
