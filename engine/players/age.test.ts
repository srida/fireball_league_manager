import { describe, expect, it } from "vitest";
import { addYears, deriveAge, yearsBetween } from "./age.js";

describe("deriveAge (spec-player-model.md §1)", () => {
  it("dérive l'âge en années entières à partir d'une date de référence explicite", () => {
    expect(deriveAge("2000-01-01", "2026-10-01")).toBe(26);
    expect(deriveAge("2007-11-01", "2026-10-01")).toBe(18);
  });

  it("utilise PLAYER_GENERATION.referenceDate par défaut si aucune référence n'est fournie", () => {
    expect(deriveAge("2000-01-01")).toBe(deriveAge("2000-01-01", "2026-10-01"));
  });
});

describe("addYears / yearsBetween (plan-développement §Phase 3 — Session 1)", () => {
  it("addYears avance une date ISO de N années civiles", () => {
    expect(addYears("2026-10-01", 1)).toBe("2027-10-01");
    expect(addYears("2026-10-01", 20)).toBe("2046-10-01");
    expect(addYears("2026-10-01", 0)).toBe("2026-10-01");
  });

  it("yearsBetween mesure l'écart entre deux dates dans le même sens qu'addYears", () => {
    expect(yearsBetween("2026-10-01", "2027-10-01")).toBe(1);
    expect(yearsBetween("2026-10-01", "2046-10-01")).toBe(20);
    expect(yearsBetween("2026-10-01", "2026-10-01")).toBe(0);
  });

  it("un joueur vieillit d'exactement un an entre deux dates de référence espacées d'un an", () => {
    const birthDate = "2005-06-15";
    const ageSeason0 = deriveAge(birthDate, "2026-10-01");
    const ageSeason1 = deriveAge(birthDate, addYears("2026-10-01", 1));
    expect(ageSeason1).toBe(ageSeason0 + 1);
  });
});
