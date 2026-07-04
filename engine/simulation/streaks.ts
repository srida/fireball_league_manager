/**
 * Détection "on fire" (plan P2 §Session 5 — UI "coach mode") : signal purement
 * dérivé du log d'événements (CLAUDE.md — "box scores et stats dérivées du log,
 * jamais calculées à part"), présentation uniquement, n'affecte jamais la
 * simulation (aucune lecture depuis possession.ts/mental.ts).
 */
import type { Event } from "../types/index.js";

const ON_FIRE_WINDOW = 4;
const ON_FIRE_MIN_MAKES = 3;

/** Joueurs ayant réussi au moins `ON_FIRE_MIN_MAKES` de leurs `ON_FIRE_WINDOW` derniers tirs tentés. */
export function computeOnFirePlayers(events: readonly Event[]): ReadonlySet<string> {
  const history = new Map<string, boolean[]>();
  for (const event of events) {
    if (event.t !== "SHOT") continue;
    const list = history.get(event.player) ?? [];
    list.push(event.result === "MAKE");
    if (list.length > ON_FIRE_WINDOW) list.shift();
    history.set(event.player, list);
  }

  const onFire = new Set<string>();
  for (const [playerId, list] of history) {
    if (list.length === ON_FIRE_WINDOW && list.filter(Boolean).length >= ON_FIRE_MIN_MAKES) onFire.add(playerId);
  }
  return onFire;
}
