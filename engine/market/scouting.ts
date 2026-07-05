/**
 * Scouting des prospects (plan-développement §Phase 3 — Session 3,
 * spec-player-model §5 : "le scouting ne renvoie que des fourchettes sur les
 * attributs et le potentiel, jamais les vraies valeurs — la largeur des
 * fourchettes dépend du budget scouting alloué, simple curseur en P3, et se
 * resserre au fil de la saison").
 *
 * Chaque équipe a son propre curseur de budget (`Team.scoutingQuality`) et
 * son propre biais d'évaluation persistant (`Team.scoutingBias`) : deux
 * équipes ne perçoivent donc pas le même prospect de la même façon — c'est ce
 * qui rend certaines équipes structurellement meilleures/pires en draft
 * ("certaines équipes scoutent mal", plan P3 §Session 3).
 *
 * `trueComposure` et les traits mentaux cachés restent invisibles sauf
 * investissement maximal, et encore avec incertitude (spec-player-model §5 :
 * "l'écart entre `composure` affiché et `trueComposure` crée les paris de
 * scouting et de draft").
 */
import { ALL_TRAITS, SCOUTING } from "../config/tuning.js";
import { SKILL_KEYS } from "../generation/player.js";
import type { RNG } from "../utils/rng.js";
import type { Player, PlayerSkills, Team, Trait } from "../types/index.js";

export type SkillKey = keyof PlayerSkills;
export type InvestmentTier = "high" | "medium" | "low";

export interface AttributeRange {
  min: number;
  max: number;
}

export interface ScoutingSnapshot {
  skills: Record<SkillKey, AttributeRange>;
  potential: AttributeRange;
  /** Estimation scoutée (jamais la vraie valeur), incluant le biais d'évaluation de l'équipe. */
  apparentValue: number;
}

export interface HiddenAttributesReport {
  trueComposure: AttributeRange;
  /** Traits suspectés — peut omettre un vrai trait ou en suggérer un faux (spec : "avec incertitude"). */
  suspectedTraits: Trait[];
}

export interface ScoutingReport {
  prospectId: string;
  /** Rang de "buzz" (réputation publique), indicatif seulement — l'investissement réel dépend du budget de l'équipe. */
  tier: InvestmentTier;
  /** Investissement effectif final de cette équipe sur ce prospect (0-1). */
  investment: number;
  /** Rapport à mi-saison : fourchettes plus larges, investissement réduit. */
  midSeason: ScoutingSnapshot;
  /** Rapport final, juste avant le draft : fourchettes resserrées (spec : "se resserre au fil de la saison"). */
  final: ScoutingSnapshot;
  /** Présent seulement si `investment >= SCOUTING.hiddenRevealThreshold`. */
  hidden?: HiddenAttributesReport;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function uncertaintyForInvestment(investment: number, widthFactor = 1): number {
  const base = SCOUTING.maxUncertainty - (SCOUTING.maxUncertainty - SCOUTING.minUncertainty) * clamp01(investment);
  return base * widthFactor;
}

/** Tire une valeur apparente bruitée + la fourchette (toujours centrée sur l'apparente, pas sur la vraie valeur). */
function scoutAttribute(
  rng: RNG,
  trueValue: number,
  investment: number,
  widthFactor = 1,
): { apparent: number; range: AttributeRange } {
  const uncertainty = uncertaintyForInvestment(investment, widthFactor);
  const noise = rng.gaussian(0, uncertainty * SCOUTING.noiseFactor, -uncertainty, uncertainty);
  const apparent = clamp(trueValue + noise, 0, 99);
  return {
    apparent,
    range: { min: clamp(apparent - uncertainty, 0, 99), max: clamp(apparent + uncertainty, 0, 99) },
  };
}

function averageSkill(player: Player): number {
  return SKILL_KEYS.reduce((sum, key) => sum + player.skills[key], 0) / SKILL_KEYS.length;
}

/** Passe rapide, forte incertitude pour tous — sert uniquement à établir le "buzz" (réputation publique) de la classe. */
function quickBuzzScore(rng: RNG, prospect: Player): number {
  const { apparent: apparentSkill } = scoutAttribute(rng, averageSkill(prospect), SCOUTING.buzzPassInvestment);
  const { apparent: apparentPotential } = scoutAttribute(rng, prospect.hidden.potential, SCOUTING.buzzPassInvestment);
  return apparentSkill * 0.4 + apparentPotential * 0.6;
}

/** Bonus d'attention universel selon le rang de buzz : tout le monde regarde davantage les prospects réputés, au-delà du budget propre à chaque équipe. */
function buzzAttentionBonus(rankIndex: number, classSize: number): number {
  const topCount = Math.round(classSize * SCOUTING.buzzTopShare);
  const midCount = Math.round(classSize * SCOUTING.buzzMidShare);
  if (rankIndex < topCount) return SCOUTING.buzzAttentionBonus.top;
  if (rankIndex < topCount + midCount) return SCOUTING.buzzAttentionBonus.mid;
  return 0;
}

function tierForRank(rankIndex: number, classSize: number): InvestmentTier {
  const topCount = Math.round(classSize * SCOUTING.buzzTopShare);
  const midCount = Math.round(classSize * SCOUTING.buzzMidShare);
  if (rankIndex < topCount) return "high";
  if (rankIndex < topCount + midCount) return "medium";
  return "low";
}

function scoutSnapshot(rng: RNG, prospect: Player, investment: number, bias: number, widthFactor = 1): ScoutingSnapshot {
  const skills = {} as Record<SkillKey, AttributeRange>;
  let apparentSkillSum = 0;
  for (const key of SKILL_KEYS) {
    const { apparent, range } = scoutAttribute(rng, prospect.skills[key], investment, widthFactor);
    skills[key] = range;
    apparentSkillSum += apparent;
  }
  const apparentSkillAverage = apparentSkillSum / SKILL_KEYS.length;

  const { apparent: apparentPotential, range: potentialRange } = scoutAttribute(
    rng,
    prospect.hidden.potential,
    investment * SCOUTING.potentialInvestmentPenalty,
    widthFactor,
  );

  return {
    skills,
    potential: potentialRange,
    apparentValue: clamp(apparentSkillAverage * 0.4 + apparentPotential * 0.6 + bias, 0, 99),
  };
}

function scoutHiddenAttributes(rng: RNG, prospect: Player): HiddenAttributesReport {
  const { range: trueComposureRange } = scoutAttribute(
    rng,
    prospect.hidden.trueComposure,
    SCOUTING.hiddenRevealThreshold,
    SCOUTING.hiddenAttributeUncertaintyFactor,
  );

  const suspectedTraits: Trait[] = [];
  for (const trait of prospect.mental.traits) {
    if (rng.bool(SCOUTING.traitRevealProbability)) suspectedTraits.push(trait);
  }
  if (rng.bool(SCOUTING.traitFalsePositiveChance)) {
    const falseCandidates = ALL_TRAITS.filter((t) => !prospect.mental.traits.includes(t));
    if (falseCandidates.length > 0) suspectedTraits.push(rng.pick(falseCandidates));
  }

  return { trueComposure: trueComposureRange, suspectedTraits };
}

/**
 * Scoute une classe de draft entière pour UNE équipe donnée : le buzz
 * (réputation publique, indépendant de l'équipe) détermine un bonus
 * d'attention universel, combiné au budget propre de l'équipe
 * (`team.scoutingQuality`) pour l'investissement final. Le biais
 * (`team.scoutingBias`) déforme systématiquement l'estimation de valeur de
 * cette équipe, jamais les fourchettes affichées des autres équipes.
 * Déterministe pour une seed donnée.
 */
export function scoutDraftClassForTeam(rng: RNG, prospects: readonly Player[], team: Team): Map<string, ScoutingReport> {
  const byBuzz = prospects
    .map((prospect) => ({ prospect, buzz: quickBuzzScore(rng, prospect) }))
    .sort((a, b) => b.buzz - a.buzz);

  const reports = new Map<string, ScoutingReport>();
  byBuzz.forEach(({ prospect }, rankIndex) => {
    const investment = clamp01(team.scoutingQuality + buzzAttentionBonus(rankIndex, prospects.length));
    const tier = tierForRank(rankIndex, prospects.length);

    const midSeason = scoutSnapshot(rng, prospect, investment * SCOUTING.midSeasonInvestmentFactor, team.scoutingBias);
    const final = scoutSnapshot(rng, prospect, investment, team.scoutingBias);
    const report: ScoutingReport = { prospectId: prospect.id, tier, investment, midSeason, final };
    if (investment >= SCOUTING.hiddenRevealThreshold) report.hidden = scoutHiddenAttributes(rng, prospect);

    reports.set(prospect.id, report);
  });

  return reports;
}

/** Scoute une classe de draft entière pour toutes les équipes de la ligue — une carte par équipe (perceptions indépendantes). */
export function scoutDraftClassForLeague(
  rng: RNG,
  prospects: readonly Player[],
  teams: readonly Team[],
): Map<string, Map<string, ScoutingReport>> {
  const reportsByTeam = new Map<string, Map<string, ScoutingReport>>();
  for (const team of teams) {
    reportsByTeam.set(team.id, scoutDraftClassForTeam(rng, prospects, team));
  }
  return reportsByTeam;
}

/**
 * Scoute un joueur déjà sur un roster (pas un prospect de draft) selon le
 * budget/biais de son équipe, à un investissement donné — réutilisé par la
 * Summer League (P3 §Session 4 : "affinage des fourchettes de scouting sur
 * ses propres jeunes") et par une future fiche joueur enrichie (projection).
 * Même mécanique que `scoutSnapshot`, exposée directement plutôt que dupliquée.
 */
export function scoutRosterPlayer(rng: RNG, player: Player, team: Team, investment: number): ScoutingSnapshot {
  return scoutSnapshot(rng, player, clamp01(investment), team.scoutingBias);
}
