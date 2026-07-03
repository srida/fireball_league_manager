/**
 * Golden master (spec-tests-phase1.md §4) : une seed de référence simule une
 * saison complète, le log d'événements complet est haché et comparé au hash
 * committé. Filet de sécurité anti-régression principal du moteur.
 *
 * Périmètre : le hash couvre la saison régulière (regularSeasonGames), pas les
 * playoffs — `simulateSeason` ne persiste pas encore le log des matchs de
 * playoffs (seuls les scores/vainqueurs de série sont retenus, voir
 * `engine/season/season.ts`). La saison régulière (1230 matchs) reste la
 * source de vérité dominante et suffisante pour détecter une régression du
 * moteur de simulation.
 */
import { createHash } from "node:crypto";
import { generateLeague } from "../../engine/generation/league.js";
import { simulateSeason } from "../../engine/season/season.js";
import { createRng } from "../../engine/utils/rng.js";

export const GOLDEN_SEED = "fblm-golden-master-v1";

export function computeGoldenHash(): string {
  const league = generateLeague(GOLDEN_SEED);
  const season = simulateSeason(createRng(`${GOLDEN_SEED}-season`), league);

  const hash = createHash("sha256");
  for (const game of season.regularSeasonGames) {
    hash.update(game.homeTeamId);
    hash.update(game.awayTeamId);
    hash.update(String(game.homeScore));
    hash.update(String(game.awayScore));
    for (const event of game.events) {
      hash.update(JSON.stringify(event));
    }
  }
  return hash.digest("hex");
}
