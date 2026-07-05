/**
 * Draft lottery + draft en 2 tours (plan-développement §Phase 3 — Sessions 2 et 3).
 * L'IA de sélection utilise désormais la valeur *apparente* (scoutée, jamais
 * la vraie valeur, cf. `scouting.ts`) additionnée d'un bonus de besoin
 * positionnel — "besoins + meilleur talent disponible" (plan P3 §Session 3).
 * L'incertitude de scouting introduit naturellement des busts (prospect
 * survalorisé par le buzz) et des steals (prospect sous-estimé, drafté tard).
 */
import { DRAFT_AI, DRAFT_LOTTERY, LEAGUE_GENERATION } from "../config/tuning.js";
import { pickFreeJerseyNumber } from "../generation/roster.js";
import { playerOverallRating } from "../players/development.js";
import type { ScoutingReport } from "./scouting.js";
import type { RNG } from "../utils/rng.js";
import type { TeamStanding } from "../season/standings.js";
import { POSITIONS } from "../types/index.js";
import type { League, Player, Position, Team } from "../types/index.js";

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

/**
 * Vraie valeur d'un prospect (potentiel + niveau actuel) — jamais visible par
 * l'IA de draft, réservée aux statistiques de validation (busts/steals, cf.
 * `batch/run.ts`) qui comparent la vraie valeur au rang réel de la sélection.
 */
export function trueProspectValue(prospect: Player): number {
  return playerOverallRating(prospect) * 0.4 + prospect.hidden.potential * 0.6;
}

/**
 * Besoin par poste d'une équipe (0 = pourvu, 1 = besoin criant) : moyenne des
 * ratings des joueurs du roster à ce poste, normalisée contre
 * `DRAFT_AI.needNormalizationRating`. Un poste sans titulaire = besoin maximal.
 */
export function computeTeamNeeds(team: Team): Record<Position, number> {
  const needs = {} as Record<Position, number>;
  for (const position of POSITIONS) {
    const playersAtPosition = team.roster.filter((p) => p.position === position);
    const avgRating =
      playersAtPosition.length === 0
        ? 0
        : playersAtPosition.reduce((sum, p) => sum + playerOverallRating(p), 0) / playersAtPosition.length;
    needs[position] = clamp01(1 - avgRating / DRAFT_AI.needNormalizationRating);
  }
  return needs;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Score de décision de l'IA de draft (plan P3 §Session 3 : "besoins + meilleur
 * talent disponible") : valeur apparente scoutée **par cette équipe précise**
 * (jamais la vraie valeur — deux équipes peuvent juger différemment le même
 * prospect, cf. `scouting.ts`) + bonus de besoin positionnel. Si l'équipe n'a
 * pas de rapport de scouting pour ce prospect (pool de test sans
 * `scoutDraftClassForLeague`), retombe sur la vraie valeur.
 */
function draftDecisionScore(
  prospect: Player,
  teamReports: ReadonlyMap<string, ScoutingReport> | undefined,
  needs: Record<Position, number> | undefined,
): number {
  const report = teamReports?.get(prospect.id);
  const apparentValue = report ? report.final.apparentValue : trueProspectValue(prospect);
  const needBonus = needs ? needs[prospect.position] * DRAFT_AI.needWeight : 0;
  return apparentValue + needBonus;
}

export interface DraftSlot {
  round: number;
  pickNumber: number;
  teamId: string;
}

export interface DraftSession {
  readonly order: readonly string[];
  isComplete(): boolean;
  /** Le pick à jouer maintenant, ou `undefined` si le draft est terminé. */
  currentPick(): DraftSlot | undefined;
  availableProspects(): readonly Player[];
  /**
   * Résout le pick courant. Avec `prospectId` : sélection explicite (typiquement
   * l'équipe du joueur humain, UI Draft "sélection au tap"). Sans argument :
   * l'IA choisit selon `draftDecisionScore` (équipes contrôlées par l'ordinateur).
   */
  makePick(prospectId?: string): DraftPickAssignment;
  result(): DraftResult;
}

/**
 * Session de draft pilotable pick par pick (plan-développement §Phase 3 —
 * Session 4, écran Draft : "sélection au tap, suivi live des picks IA") — la
 * seule façon de faire jouer un humain une partie des picks tout en laissant
 * l'IA gérer le reste du même draft. `runDraft` (ci-dessous) n'est qu'un
 * déroulé automatique intégral de cette même session, pour le batch/les tests.
 */
export function createDraftSession(
  order: readonly string[],
  prospectPool: readonly Player[],
  scoutingReportsByTeam?: ReadonlyMap<string, ReadonlyMap<string, ScoutingReport>>,
  teams?: readonly Team[],
): DraftSession {
  const available: Player[] = [...prospectPool];
  const picks: DraftPickAssignment[] = [];
  const teamsById = new Map((teams ?? []).map((t) => [t.id, t]));
  const totalSlots = order.length * DRAFT_LOTTERY.roundCount;
  let nextIndex = 0;

  function slotAt(index: number): DraftSlot | undefined {
    if (index >= totalSlots || available.length === 0) return undefined;
    return {
      round: Math.floor(index / order.length) + 1,
      pickNumber: (index % order.length) + 1,
      teamId: order[index % order.length] as string,
    };
  }

  return {
    order,
    isComplete: () => slotAt(nextIndex) === undefined,
    currentPick: () => slotAt(nextIndex),

    availableProspects: () => available,

    makePick(prospectId?: string): DraftPickAssignment {
      const slot = slotAt(nextIndex);
      if (!slot) throw new Error("createDraftSession.makePick: draft déjà terminé");

      let prospect: Player;
      if (prospectId !== undefined) {
        const idx = available.findIndex((p) => p.id === prospectId);
        if (idx === -1) throw new Error(`createDraftSession.makePick: prospect ${prospectId} indisponible`);
        prospect = available.splice(idx, 1)[0] as Player;
      } else {
        const team = teamsById.get(slot.teamId);
        const needs = team ? computeTeamNeeds(team) : undefined;
        const teamReports = scoutingReportsByTeam?.get(slot.teamId);
        available.sort((a, b) => draftDecisionScore(b, teamReports, needs) - draftDecisionScore(a, teamReports, needs));
        prospect = available.shift() as Player;
      }

      const assignment: DraftPickAssignment = { round: slot.round, pickNumber: slot.pickNumber, teamId: slot.teamId, prospect };
      picks.push(assignment);
      nextIndex++;
      return assignment;
    },

    result: () => ({ order, picks, undraftedProspects: available }),
  };
}

/**
 * Joue le draft complet (2 tours, spec plan P3 §Session 2) sans interaction —
 * déroulé intégral de `createDraftSession` (IA sur tous les picks). Utilisé
 * par le batch et les tests ; l'écran Draft interactif utilise
 * `createDraftSession` directement pour intercaler les choix de l'utilisateur.
 */
export function runDraft(
  order: readonly string[],
  prospectPool: readonly Player[],
  scoutingReportsByTeam?: ReadonlyMap<string, ReadonlyMap<string, ScoutingReport>>,
  teams?: readonly Team[],
): DraftResult {
  const session = createDraftSession(order, prospectPool, scoutingReportsByTeam, teams);
  while (!session.isComplete()) session.makePick();
  return session.result();
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
