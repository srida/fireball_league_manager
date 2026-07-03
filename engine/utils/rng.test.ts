import { describe, expect, it } from "vitest";
import { createRng } from "./rng.js";

describe("createRng — reproductibilité", () => {
  it("la même seed numérique produit exactement la même séquence", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("la même seed textuelle produit exactement la même séquence", () => {
    const a = createRng("saison-2026-seed-1");
    const b = createRng("saison-2026-seed-1");
    expect(a.int(0, 1000)).toBe(b.int(0, 1000));
    expect(a.float(0, 1)).toBe(b.float(0, 1));
    expect(a.gaussian(50, 10)).toBe(b.gaussian(50, 10));
  });

  it("deux seeds différentes produisent des séquences différentes", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("next() reste dans [0, 1)", () => {
    const rng = createRng("bounds-check");
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(min, max) respecte les bornes inclusives", () => {
    const rng = createRng("int-bounds");
    for (let i = 0; i < 500; i++) {
      const v = rng.int(5, 8);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(8);
    }
  });

  it("float(min, max) respecte les bornes", () => {
    const rng = createRng("float-bounds");
    for (let i = 0; i < 500; i++) {
      const v = rng.float(-3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(3);
    }
  });

  it("gaussian bornée respecte min/max même avec un stdDev élevé", () => {
    const rng = createRng("gaussian-bounds");
    for (let i = 0; i < 500; i++) {
      const v = rng.gaussian(50, 40, 0, 99);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(99);
    }
  });

  it("gaussian non bornée converge statistiquement vers la moyenne demandée", () => {
    const rng = createRng("gaussian-mean");
    const n = 5000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += rng.gaussian(70, 5);
    const mean = sum / n;
    expect(mean).toBeGreaterThan(68);
    expect(mean).toBeLessThan(72);
  });

  it("pick() ne renvoie que des éléments du tableau", () => {
    const rng = createRng("pick-test");
    const items = ["a", "b", "c"];
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it("pick() lève une erreur sur un tableau vide", () => {
    const rng = createRng("pick-empty");
    expect(() => rng.pick([])).toThrow();
  });

  it("weightedPick() favorise statistiquement l'élément le plus lourd", () => {
    const rng = createRng("weighted-pick");
    const counts = { rare: 0, frequent: 0 };
    for (let i = 0; i < 2000; i++) {
      const result = rng.weightedPick([
        { item: "rare" as const, weight: 1 },
        { item: "frequent" as const, weight: 9 },
      ]);
      counts[result]++;
    }
    expect(counts.frequent).toBeGreaterThan(counts.rare * 4);
  });

  it("bool() respecte approximativement la probabilité fournie", () => {
    const rng = createRng("bool-test");
    let trueCount = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      if (rng.bool(0.1)) trueCount++;
    }
    const ratio = trueCount / n;
    expect(ratio).toBeGreaterThan(0.06);
    expect(ratio).toBeLessThan(0.14);
  });
});
