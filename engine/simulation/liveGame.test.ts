/**
 * Tests unitaires du mode match live (plan-développement §Phase 2 — Session 4).
 * `LiveGameSession` enveloppe `gameEngine.ts` (extrait de `game.ts`) : le test le
 * plus important est l'équivalence stricte avec `simulateGame` en l'absence
 * d'intervention — la Session 4 ne doit rien changer au mode instantané.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { generateLeague } from "../generation/league.js";
import { simulateGame } from "./game.js";
import { LiveGameSession } from "./liveGame.js";
import { TIMEOUT } from "../config/tuning.js";

function twoTeams(seed: string) {
  const league = generateLeague(seed);
  return { home: league.teams[0]!, away: league.teams[1]! };
}

function simOptions(gameId: string, home: ReturnType<typeof twoTeams>["home"], away: ReturnType<typeof twoTeams>["away"]) {
  return {
    gameId,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeRoster: home.roster,
    awayRoster: away.roster,
    homeTactics: home.tactics,
    awayTactics: away.tactics,
  };
}

describe("LiveGameSession — équivalence stricte avec simulateGame sans intervention (plan P2 §Session 4)", () => {
  it("stepper jusqu'à la fin sans intervenir produit le même log qu'une simulation instantanée", () => {
    const { home, away } = twoTeams("live-equiv-league");
    const options = simOptions("g-equiv", home, away);

    const instant = simulateGame(createRng("live-equiv-sim"), options);

    const session = new LiveGameSession(createRng("live-equiv-sim"), options);
    let snap = session.step();
    while (!snap.isOver) snap = session.step();
    const live = session.getResult();

    expect(live.game.events).toEqual(instant.game.events);
    expect(live.game.homeScore).toBe(instant.game.homeScore);
    expect(live.game.awayScore).toBe(instant.game.awayScore);
    expect(live.minutesPlayed).toEqual(instant.minutesPlayed);
    expect(live.injuries).toEqual(instant.injuries);
  });
});

describe("LiveGameSession — interventions (plan P2 §Session 4)", () => {
  it("callTimeout consomme un temps-mort, récupère de la fatigue, et refuse au-delà du quota", () => {
    const { home, away } = twoTeams("live-timeout-league");
    const session = new LiveGameSession(createRng("live-timeout-sim"), simOptions("g-timeout", home, away));

    session.step();
    const beforeStamina = { ...session.getState().gameStamina };
    const result = session.callTimeout("HOME");

    expect(result.granted).toBe(true);
    expect(result.timeoutsRemaining.HOME).toBe(TIMEOUT.perTeamPerGame - 1);
    for (const oc of session.getState().onCourt.HOME) {
      expect(session.getState().gameStamina[oc.player.id]).toBeGreaterThanOrEqual(beforeStamina[oc.player.id] ?? 0);
    }

    for (let i = 0; i < TIMEOUT.perTeamPerGame - 1; i++) session.callTimeout("HOME");
    const exhausted = session.callTimeout("HOME");
    expect(exhausted.granted).toBe(false);
    expect(exhausted.timeoutsRemaining.HOME).toBe(0);
  });

  it("substitute échange un joueur sur le terrain contre un joueur de banc valide, émet un SUB", () => {
    const { home, away } = twoTeams("live-sub-league");
    const session = new LiveGameSession(createRng("live-sub-sim"), simOptions("g-sub", home, away));
    session.step();

    const onCourt = session.getState().onCourt.HOME;
    const outPlayerId = onCourt[0]!.player.id;
    const onCourtIds = new Set(onCourt.map((oc) => oc.player.id));
    const bench = home.roster.find((p) => !onCourtIds.has(p.id))!;

    const event = session.substitute("HOME", outPlayerId, bench.id);
    expect(event?.t).toBe("SUB");
    const nextOnCourtIds = session.getState().onCourt.HOME.map((oc) => oc.player.id);
    expect(nextOnCourtIds).toContain(bench.id);
    expect(nextOnCourtIds).not.toContain(outPlayerId);
  });

  it("substitute refuse un entrant déjà sur le terrain ou un sortant absent du terrain", () => {
    const { home, away } = twoTeams("live-sub-invalid-league");
    const session = new LiveGameSession(createRng("live-sub-invalid-sim"), simOptions("g-sub-invalid", home, away));
    session.step();

    const onCourt = session.getState().onCourt.HOME;
    expect(session.substitute("HOME", "joueur-inexistant", onCourt[1]!.player.id)).toBeUndefined();
    expect(session.substitute("HOME", onCourt[0]!.player.id, onCourt[1]!.player.id)).toBeUndefined();
  });

  it("setTactics change la tactique d'une équipe immédiatement", () => {
    const { home, away } = twoTeams("live-tactics-league");
    const session = new LiveGameSession(createRng("live-tactics-sim"), simOptions("g-tactics", home, away));
    session.step();

    session.setTactics("AWAY", { ...away.tactics, pace: "FAST" });
    expect(session.getState().tactics.AWAY.pace).toBe("FAST");
  });
});
