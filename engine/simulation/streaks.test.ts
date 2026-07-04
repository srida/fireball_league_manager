import { describe, expect, it } from "vitest";
import { computeOnFirePlayers } from "./streaks.js";
import type { Event } from "../types/index.js";

function shot(player: string, result: "MAKE" | "MISS"): Event {
  return { t: "SHOT", player, shotType: "MID_RANGE", result, contest: "OPEN", clock: 500 };
}

describe("computeOnFirePlayers (plan P2 §Session 5 — présentation)", () => {
  it("détecte un joueur avec 3 tirs réussis sur ses 4 derniers tirs", () => {
    const events = [shot("p1", "MISS"), shot("p1", "MAKE"), shot("p1", "MAKE"), shot("p1", "MAKE")];
    expect(computeOnFirePlayers(events).has("p1")).toBe(true);
  });

  it("ignore un joueur sous le seuil (2/4)", () => {
    const events = [shot("p1", "MAKE"), shot("p1", "MISS"), shot("p1", "MAKE"), shot("p1", "MISS")];
    expect(computeOnFirePlayers(events).has("p1")).toBe(false);
  });

  it("ignore un joueur avec moins de ON_FIRE_WINDOW tirs tentés", () => {
    const events = [shot("p1", "MAKE"), shot("p1", "MAKE"), shot("p1", "MAKE")];
    expect(computeOnFirePlayers(events).has("p1")).toBe(false);
  });

  it("ne considère que la fenêtre glissante la plus récente", () => {
    const events = [
      shot("p1", "MAKE"),
      shot("p1", "MAKE"),
      shot("p1", "MAKE"),
      shot("p1", "MISS"),
      shot("p1", "MISS"),
      shot("p1", "MISS"),
    ];
    expect(computeOnFirePlayers(events).has("p1")).toBe(false);
  });

  it("ignore les événements non-SHOT", () => {
    const events: Event[] = [
      { t: "REBOUND", player: "p1", side: "DEF", clock: 500 },
      shot("p1", "MAKE"),
      shot("p1", "MAKE"),
      shot("p1", "MAKE"),
      shot("p1", "MAKE"),
    ];
    expect(computeOnFirePlayers(events).has("p1")).toBe(true);
  });
});
