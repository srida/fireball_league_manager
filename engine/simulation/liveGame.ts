/**
 * Mode match live (plan-développement §Phase 2 — Session 4 : "score et stats en
 * temps réel, temps-morts, changements, ajustements tactiques"). `LiveGameSession`
 * enveloppe `GameEngine` (gameEngine.ts) : chaque `.step()` avance exactement une
 * possession et renvoie un instantané sérialisable (score, horloge, derniers
 * événements) — le GM peut intervenir entre deux appels via `.callTimeout()`,
 * `.substitute()`, `.setTactics()`. Objet explicite plutôt qu'un générateur
 * (décision produit Session 4) : plus simple à sérialiser/persister pour une
 * future couche UI ou un futur client-serveur, sans les subtilités de pause/
 * reprise d'un `function*`.
 *
 * N'affecte jamais le mode instantané (`simulateGame`, game.ts) ni le hash
 * golden master : `season.ts` continue d'utiliser `simulateGame` exclusivement,
 * ce module n'est consommé que par le démo CLI (`batch/live-demo.ts`) et par
 * une future UI de match live (techno décidée plus tard, CLAUDE.md).
 */
import { computeVarianceFactor } from "./mental.js";
import { createGameEngine, type SimulateGameOptions, type SimulatedGame } from "./gameEngine.js";
import type { RNG } from "../utils/rng.js";
import type { Event, TeamSide, TeamTactics } from "../types/index.js";

export interface LiveSnapshot {
  quarter: number;
  clockSeconds: number;
  homeScore: number;
  awayScore: number;
  /** Événements produits par le dernier `.step()`/`.callTimeout()`/`.substitute()` (flux texte). */
  recentEvents: Event[];
  isOver: boolean;
  timeoutsRemaining: Record<TeamSide, number>;
}

export class LiveGameSession {
  private readonly engine: ReturnType<typeof createGameEngine>;
  private isOver = false;

  constructor(rng: RNG, options: SimulateGameOptions) {
    const variance: Record<string, number> = {};
    for (const p of options.homeRoster) variance[p.id] = computeVarianceFactor(p, rng);
    for (const p of options.awayRoster) variance[p.id] = computeVarianceFactor(p, rng);
    this.engine = createGameEngine(rng, { ...options, variance });
  }

  /** Avance exactement une possession (ou une transition de quart-temps). */
  step(): LiveSnapshot {
    const before = this.engine.game.events.length;
    this.isOver = this.engine.stepPossession();
    return this.snapshot(this.engine.game.events.slice(before));
  }

  /** Temps-mort : récupération de fatigue + fenêtre libre pour substitution/tactique. Faux si plus de temps-mort disponible. */
  callTimeout(side: TeamSide): LiveSnapshot & { granted: boolean } {
    const before = this.engine.game.events.length;
    const granted = this.engine.callTimeout(side);
    return { ...this.snapshot(this.engine.game.events.slice(before)), granted };
  }

  /** Substitution manuelle. `undefined` si invalide (voir gameEngine.ts). */
  substitute(side: TeamSide, outPlayerId: string, inPlayerId: string): Event | undefined {
    return this.engine.substitute(side, outPlayerId, inPlayerId);
  }

  /** Lecture de l'état vivant (joueurs sur le terrain, etc.) — pour une UI/démo qui a besoin de plus que le flux d'événements. */
  getState() {
    return this.engine.getState();
  }

  setTactics(side: TeamSide, tactics: TeamTactics): void {
    this.engine.setTactics(side, tactics);
  }

  getTimeoutsRemaining(side: TeamSide): number {
    return this.engine.getTimeoutsRemaining(side);
  }

  /** Résultat final complet (même forme que `simulateGame`) — appelable dès que `isOver` est vrai. */
  getResult(): SimulatedGame {
    return this.engine.finalize();
  }

  private snapshot(recentEvents: Event[]): LiveSnapshot {
    const state = this.engine.getState();
    return {
      quarter: state.quarter,
      clockSeconds: state.clockSeconds,
      homeScore: this.engine.game.homeScore,
      awayScore: this.engine.game.awayScore,
      recentEvents,
      isOver: this.isOver,
      timeoutsRemaining: { HOME: this.engine.getTimeoutsRemaining("HOME"), AWAY: this.engine.getTimeoutsRemaining("AWAY") },
    };
  }
}
