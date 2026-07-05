/**
 * Boucle annuelle post-saison (plan-développement §Phase 3 — Session 4 :
 * "fin de playoffs → retraites → lottery → draft → Summer League → nouvelle
 * saison"). Enchaîne, sur la même `League` mutée en place : progression/
 * déclin/retraites (`runOffseason`, Session 1), classe de draft + lottery +
 * scouting + draft (Sessions 2/3), puis Summer League (Session 4). Free
 * agency n'existe pas avant la Phase 4 (pas d'étape ici). Point d'entrée
 * unique réutilisé par `batch/run.ts` et par une future UI de transition de
 * saison — single source of truth pour l'ordre des étapes (CLAUDE.md).
 */
import { generateDraftClass, drawDraftClassQualityOffset } from "../generation/draftClass.js";
import { runOffseason, type OffseasonResult } from "./offseason.js";
import { applyDraftToRosters, computeDraftOrder, runDraft, type DraftResult } from "../market/draft.js";
import { scoutDraftClassForLeague } from "../market/scouting.js";
import { runSummerLeague, type SummerLeagueResult } from "./summerLeague.js";
import type { RNG } from "../utils/rng.js";
import type { League } from "../types/index.js";
import type { TeamStanding } from "./standings.js";

export interface AnnualCycleResult {
  referenceDate: string;
  offseason: OffseasonResult;
  draft: DraftResult;
  draftClassSize: number;
  draftClassQualityOffset: number;
  summerLeague: SummerLeagueResult;
}

/**
 * Seules ces deux données de la saison écoulée sont nécessaires au cycle
 * annuel (progression par minutes jouées, ordre de lottery par classement) —
 * typé en sous-ensemble plutôt qu'en `SeasonResult` complet pour que
 * l'orchestrateur reste utilisable aussi bien par `simulateSeason` (batch)
 * que par `SeasonRunner` (UI interactive, saison régulière jouée match par
 * match), qui ne produit pas de `SeasonResult` complet (pas de playoffs
 * interactifs encore, cf. `seasonRunner.ts`).
 */
export interface AnnualCycleSeasonInput {
  minutesByPlayer: Readonly<Record<string, number>>;
  standings: readonly TeamStanding[];
}

/**
 * Fait tourner un cycle annuel complet à partir du résultat d'une saison qui
 * vient de se terminer. Mute `league` en place (rosters, joueurs) — même
 * convention que `runOffseason`/`applyDraftToRosters`. `referenceDate` est la
 * date "actuelle" de la ligue après ce cycle (ex.
 * `addYears(PLAYER_GENERATION.referenceDate, n)`).
 */
export function runAnnualCycle(rng: RNG, league: League, season: AnnualCycleSeasonInput, referenceDate: string): AnnualCycleResult {
  const offseason = runOffseason(rng, league, season.minutesByPlayer, referenceDate);

  const draftClassQualityOffset = drawDraftClassQualityOffset(rng);
  const prospects = generateDraftClass(rng, referenceDate, draftClassQualityOffset);
  const order = computeDraftOrder(rng, season.standings);
  const scoutingReportsByTeam = scoutDraftClassForLeague(rng, prospects, league.teams);
  const draft = runDraft(order, prospects, scoutingReportsByTeam, league.teams);
  applyDraftToRosters(rng, league, draft);

  const summerLeague = runSummerLeague(rng, league);

  return {
    referenceDate,
    offseason,
    draft,
    draftClassSize: prospects.length,
    draftClassQualityOffset,
    summerLeague,
  };
}
