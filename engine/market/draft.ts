/**
 * Draft lottery + draft en 2 tours (plan-développement §Phase 3 — Session 2).
 * IA de sélection volontairement simple cette session : "meilleur talent
 * disponible" sur les vraies valeurs (potentiel + niveau actuel) — aucune
 * incertitude de scouting n'existe encore (Session 3), donc pas de notion de
 * "besoins d'équipe" ni de fourchettes ici. `docs/decisions.md` documente ce
 * choix de scope.
 */
import { DRAFT_LOTTERY, LEAGUE_GENERATION } from "../config/tuning.js";
import { pickFreeJerseyNumber } from "../generation/roster.js";
import { playerOverallRating } from "../players/development.js";
import type { RNG } from "../utils/rng.js";
import type { TeamStanding } from "../season/standings.js";
import type { League, Player } from "../types/index.js";

export interface DraftPickAssignment {
  round: number; // 1..DRAFT_LOTTERY.roundCount
  pickNumber: number; // 1..30, position dans le tour
  teamId: string;
  prospect: Player;
}

export interface DraftResult {
  /** Ordre de draft des 30 équipes (lottery pour les 14 premières, classement inversé ensuite). Réutilisé tel quel au tour 2. */
  order: readonly string[];
  picks: DraftPickAssignment[];
  /** Prospects non sélectionnés — pool de free agents invisibles en P3 (spec : réservé à la Phase 4). */
  undraftedProspects: Player[];
}

/**
 * Calcule l'ordre de draft complet à partir du classement de la saison qui
 * vient de se terminer : lottery pondérée (odds NBA post-2019) sur les
 * `DRAFT_LOTTERY.lotteryTeamCount` pires équipes pour les
 * `DRAFT_LOTTERY.drawnPicksCount` premiers picks, puis classement inversé pour
 * le reste des équipes lottery, puis classement inversé des équipes
 * qualifiées aux playoffs (spec : "le reste par classement inversé").
 */
export function computeDraftOrder(rng: RNG, standings: readonly TeamStanding[]): string[] {
  const worstToBest = [...standings].reverse().map((s) => s.teamId);
  const lotteryTeamIds = worstToBest.slice(0, DRAFT_LOTTERY.lotteryTeamCount);
  const nonLotteryTeamIds = worstToBest.slice(DRAFT_LOTTERY.lotteryTeamCount);

  const remaining = lotteryTeamIds.map((teamId, i) => ({
    teamId,
    weight: DRAFT_LOTTERY.pickOneOddsPerThousand[i] ?? 1,
  }));

  const drawnOrder: string[] = [];
  for (let i = 0; i < DRAFT_LOTTERY.drawnPicksCount && remaining.length > 0; i++) {
    const picked = rng.weightedPick(remaining.map((r) => ({ item: r.teamId, weight: r.weight })));
    drawnOrder.push(picked);
    const idx = remaining.findIndex((r) => r.teamId === picked);
    remaining.splice(idx, 1);
  }
  // Équipes lottery non tirées : classement inversé (ordre déjà conservé dans `remaining`).
  const restLotteryOrder = remaining.map((r) => r.teamId);

  return [...drawnOrder, ...restLotteryOrder, ...nonLotteryTeamIds];
}

/** Valeur d'un prospect pour une IA de draft "meilleur talent disponible" — pas de scouting/incertitude cette session. */
function prospectValue(prospect: Player): number {
  return playerOverallRating(prospect) * 0.4 + prospect.hidden.potential * 0.6;
}

/**
 * Joue le draft complet (2 tours, spec plan P3 §Session 2) : à chaque pick,
 * l'équipe sélectionne le meilleur prospect restant. Le tour 2 reuse le même
 * ordre que le tour 1 (simplification documentée, `docs/decisions.md`).
 */
export function runDraft(order: readonly string[], prospectPool: readonly Player[]): DraftResult {
  const available = [...prospectPool];
  const picks: DraftPickAssignment[] = [];

  for (let round = 1; round <= DRAFT_LOTTERY.roundCount; round++) {
    for (let i = 0; i < order.length; i++) {
      if (available.length === 0) break;
      available.sort((a, b) => prospectValue(b) - prospectValue(a));
      const prospect = available.shift() as Player;
      picks.push({ round, pickNumber: i + 1, teamId: order[i] as string, prospect });
    }
  }

  return { order, picks, undraftedProspects: available };
}

/**
 * Intègre les picks au roster de chaque équipe (spec : "extension temporaire à
 * 17 joueurs autorisée en P3"). Le reste du moteur (rotations, tactiques,
 * fatigue) est calibré pour des rosters de `LEAGUE_GENERATION.rosterSize` (15) :
 * en l'absence de tout système de contrats/waivers avant la Phase 4, l'extension
 * à 17 est immédiatement retaillée à 15 en coupant les moins bien notés — même
 * principe que des coupes de fin de training camp (docs/decisions.md).
 */
export function applyDraftToRosters(rng: RNG, league: League, draftResult: DraftResult): void {
  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  const rookiesByTeam = new Map<string, Player[]>();
  for (const pick of draftResult.picks) {
    const rookies = rookiesByTeam.get(pick.teamId) ?? [];
    rookies.push(pick.prospect);
    rookiesByTeam.set(pick.teamId, rookies);
  }

  for (const [teamId, rookies] of rookiesByTeam) {
    const team = teamById.get(teamId);
    if (!team) continue;

    for (const rookie of rookies) {
      rookie.jerseyNumber = pickFreeJerseyNumber(rng, team.roster);
      team.roster.push(rookie);
    }

    if (team.roster.length > LEAGUE_GENERATION.rosterSize) {
      team.roster.sort((a, b) => playerOverallRating(b) - playerOverallRating(a));
      team.roster = team.roster.slice(0, LEAGUE_GENERATION.rosterSize);
    }
  }
}
