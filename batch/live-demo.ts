/**
 * Démo scriptée du mode match live (plan-développement §Phase 2 — Session 4 :
 * "UI de match live... flux texte + score"). Valide de bout en bout l'API
 * `LiveGameSession` (engine/simulation/liveGame.ts) : avance possession par
 * possession, imprime un play-by-play textuel, et applique une séquence
 * scriptée d'interventions (temps-mort, substitution manuelle, ajustement
 * tactique) à des moments réalistes du match.
 *
 * Décision produit Session 4 : reste un outil de validation batch scripté
 * (CLAUDE.md — "le harnais batch est un produit"), pas une UI interactive —
 * la technologie d'UI n'est pas encore choisie (CLAUDE.md "UI décidée plus
 * tard, découplée du moteur").
 *
 * Usage : npm run live-demo -- --seed=fblm-live-demo
 */
import { generateLeague } from "../engine/generation/league.js";
import { createRng } from "../engine/utils/rng.js";
import { LiveGameSession, type LiveSnapshot } from "../engine/simulation/liveGame.js";
import { playerRating } from "../engine/simulation/rotation.js";
import type { Event, Player } from "../engine/types/index.js";

function parseArgs(argv: readonly string[]): { seed: string } {
  let seed = "fblm-live-demo";
  for (const arg of argv) {
    const seedMatch = /^--seed=(.+)$/.exec(arg);
    if (seedMatch) seed = seedMatch[1] as string;
  }
  return { seed };
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function name(playersById: ReadonlyMap<string, Player>, id: string): string {
  const p = playersById.get(id);
  return p ? `${p.firstName} ${p.lastName}` : id;
}

/**
 * Rendu texte d'un événement (spec-possession-algorithm.md §9 : "le play-by-play
 * affiché en mode live est un simple rendu textuel [du log]"). REBOUND et
 * FREE_THROW ne sont volontairement pas rendus ligne par ligne (bruit élevé
 * pour un flux texte minimal) — ils restent dans le log et le box score.
 */
function formatEvent(event: Event, playersById: ReadonlyMap<string, Player>): string | undefined {
  switch (event.t) {
    case "SHOT":
      if (event.result === "MAKE") {
        const points = event.shotType === "THREE" ? 3 : 2;
        const assist = event.assistBy ? ` (passe déc. ${name(playersById, event.assistBy)})` : "";
        return `${name(playersById, event.player)} marque (+${points})${assist}`;
      }
      if (event.result === "BLOCK") {
        return `${name(playersById, event.player)} est contré par ${name(playersById, event.blockedBy ?? "")}`;
      }
      return undefined;
    case "TURNOVER":
      return `Perte de balle : ${name(playersById, event.player)}${event.stealBy ? ` (interception ${name(playersById, event.stealBy)})` : ""}`;
    case "INJURY":
      return `Blessure (${event.severity}) : ${name(playersById, event.player)} quitte le match`;
    case "SUB":
      return `Changement : ${name(playersById, event.in)} entre pour ${name(playersById, event.out)}`;
    case "TIMEOUT":
      return `Temps-mort (${event.side})`;
    default:
      return undefined;
  }
}

function main(): void {
  const { seed } = parseArgs(process.argv.slice(2));
  const league = generateLeague(seed);
  const home = league.teams[0]!;
  const away = league.teams[1]!;
  const rng = createRng(`${seed}-game`);

  const playersById = new Map<string, Player>();
  for (const p of [...home.roster, ...away.roster]) playersById.set(p.id, p);

  const session = new LiveGameSession(rng, {
    gameId: "live-demo",
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeRoster: home.roster,
    awayRoster: away.roster,
    homeTactics: home.tactics,
    awayTactics: away.tactics,
  });

  console.log(`=== ${home.name} vs ${away.name} (mode live, seed="${seed}") ===\n`);

  let timeoutCalled = false;
  let subApplied = false;
  let tacticsChanged = false;

  const printSnapshot = (snap: LiveSnapshot) => {
    for (const event of snap.recentEvents) {
      const line = formatEvent(event, playersById);
      if (!line) continue;
      console.log(`[Q${snap.quarter} ${formatClock(snap.clockSeconds)}] ${line}  —  ${home.name} ${snap.homeScore} - ${snap.awayScore} ${away.name}`);
    }
  };

  while (true) {
    const snap = session.step();
    printSnapshot(snap);

    if (!timeoutCalled && snap.quarter === 2 && snap.clockSeconds <= 400) {
      timeoutCalled = true;
      const result = session.callTimeout("HOME");
      console.log(`>>> ${home.name} appelle un temps-mort (${result.granted ? "accordé" : "refusé"}, il en reste ${result.timeoutsRemaining.HOME}).`);
    }

    if (!subApplied && snap.quarter === 3 && snap.clockSeconds <= 400) {
      subApplied = true;
      const state = session.getState();
      const onCourtAway = state.onCourt.AWAY;
      const worstOnCourt = [...onCourtAway].sort((a, b) => playerRating(a.player) - playerRating(b.player))[0];
      const onCourtIds = new Set(onCourtAway.map((oc) => oc.player.id));
      const bestBench = [...away.roster]
        .filter((p) => !onCourtIds.has(p.id) && !(p.id in state.injuries))
        .sort((a, b) => playerRating(b) - playerRating(a))[0];
      if (worstOnCourt && bestBench) {
        const event = session.substitute("AWAY", worstOnCourt.player.id, bestBench.id);
        console.log(
          event
            ? `>>> ${away.name} fait entrer ${name(playersById, bestBench.id)} pour ${name(playersById, worstOnCourt.player.id)}.`
            : `>>> Substitution manuelle refusée (invalide).`,
        );
      }
    }

    if (!tacticsChanged && snap.quarter === 4 && snap.clockSeconds <= 400) {
      tacticsChanged = true;
      session.setTactics("HOME", { ...home.tactics, pace: "FAST" });
      console.log(`>>> ${home.name} passe en rythme rapide (pace: FAST).`);
    }

    if (snap.isOver) break;
  }

  const result = session.getResult();
  console.log(`\n=== FINAL : ${home.name} ${result.game.homeScore} - ${result.game.awayScore} ${away.name} ===`);
}

main();
