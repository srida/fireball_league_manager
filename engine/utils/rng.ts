/**
 * RNG seedé et injectable — CLAUDE.md §Architecture point 2 :
 * "Tout tirage aléatoire passe par un RNG seedé injecté (jamais Math.random() direct)."
 *
 * Implémentation : mulberry32 (PRNG 32 bits, rapide, distribution suffisante
 * pour un jeu de simulation — pas un usage cryptographique).
 */

export interface RNG {
  /** Nombre flottant dans [0, 1). Primitive de base, toutes les autres méthodes en dérivent. */
  next(): number;
  /** Entier dans [min, max] (bornes incluses). */
  int(min: number, max: number): number;
  /** Flottant dans [min, max). */
  float(min: number, max: number): number;
  /** Booléen, `pTrue` = probabilité de `true` (défaut 0.5). */
  bool(pTrue?: number): boolean;
  /** Tirage gaussien (Box-Muller) centré sur `mean`, borné dans [min, max] si fournis. */
  gaussian(mean: number, stdDev: number, min?: number, max?: number): number;
  /** Élément aléatoire uniforme d'un tableau non vide. */
  pick<T>(items: readonly T[]): T;
  /** Élément aléatoire pondéré. Les poids doivent être positifs, somme > 0. */
  weightedPick<T>(items: readonly { item: T; weight: number }[]): T;
}

function xfnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Crée un RNG déterministe : la même seed produit toujours la même séquence.
 * `seed` peut être un nombre (utilisé tel quel) ou une chaîne (hachée en 32 bits).
 */
export function createRng(seed: number | string): RNG {
  const numericSeed = typeof seed === "string" ? xfnv1a(seed) : seed >>> 0;
  const next = mulberry32(numericSeed);

  const rng: RNG = {
    next,

    int(min: number, max: number): number {
      if (max < min) {
        throw new Error(`RNG.int: max (${max}) < min (${min})`);
      }
      return Math.floor(next() * (max - min + 1)) + min;
    },

    float(min: number, max: number): number {
      return next() * (max - min) + min;
    },

    bool(pTrue = 0.5): boolean {
      return next() < pTrue;
    },

    gaussian(mean: number, stdDev: number, min?: number, max?: number): number {
      // Box-Muller polaire, évite le cas dégénéré u === 0.
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      let result = mean + z * stdDev;
      if (min !== undefined) result = Math.max(min, result);
      if (max !== undefined) result = Math.min(max, result);
      return result;
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("RNG.pick: tableau vide");
      }
      return items[Math.floor(next() * items.length)] as T;
    },

    weightedPick<T>(items: readonly { item: T; weight: number }[]): T {
      if (items.length === 0) {
        throw new Error("RNG.weightedPick: tableau vide");
      }
      const total = items.reduce((sum, entry) => sum + entry.weight, 0);
      if (total <= 0) {
        throw new Error("RNG.weightedPick: somme des poids <= 0");
      }
      let roll = next() * total;
      for (const entry of items) {
        roll -= entry.weight;
        if (roll <= 0) return entry.item;
      }
      // Filet de sécurité pour les arrondis flottants.
      return items[items.length - 1]!.item;
    },
  };

  return rng;
}
