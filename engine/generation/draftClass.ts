/**
 * Génération d'une classe de draft annuelle (plan-développement §Phase 3 —
 * Session 2). Réutilise le pipeline standard (`generatePlayer`) puis ajuste ce
 * qui distingue un prospect d'un joueur confirmé : plus jeune, technique
 * actuelle faible (pas encore développée), potentiel plus dispersé — même
 * logique que le remplaçant générique de l'intersaison (`offseason.ts`), qui
 * post-traite déjà `generatePlayer` plutôt que de dupliquer tout le pipeline
 * de génération (physique/mental/traits restent la même source de vérité).
 */
import { DRAFT_GENERATION } from "../config/tuning.js";
import { randomBirthDateForAge } from "../players/age.js";
import { generatePlayer, SKILL_KEYS } from "./player.js";
import { archetypesForPosition } from "./roster.js";
import type { RNG } from "../utils/rng.js";
import { POSITIONS, type Player } from "../types/index.js";

/** Décalage de qualité de cuvée pour toute une classe (spec plan P3 §Session 2 : "bonnes/mauvaises années"), tiré une fois. */
export function drawDraftClassQualityOffset(rng: RNG): number {
  return rng.gaussian(0, DRAFT_GENERATION.classQualityStdDev, -DRAFT_GENERATION.classQualityMax, DRAFT_GENERATION.classQualityMax);
}

function generateProspect(rng: RNG, referenceDate: string, classQualityOffset: number): Player {
  const position = rng.pick(POSITIONS);
  const archetypeId = rng.pick(archetypesForPosition(position));
  const prospect = generatePlayer(rng, archetypeId, position);

  prospect.birthDate = randomBirthDateForAge(rng, referenceDate, DRAFT_GENERATION.ageRange);

  // Technique actuelle faible (spec : "attributs actuels FAIBLES") — un prospect
  // n'a pas encore le niveau d'un joueur confirmé du même archétype.
  for (const key of SKILL_KEYS) {
    prospect.skills[key] = Math.round(prospect.skills[key] * DRAFT_GENERATION.skillDiscount);
  }

  // Potentiel variable, décalé par la qualité de la cuvée — remplace le
  // `potential` de la génération standard (variance plus étroite, pas pensée
  // pour des prospects).
  const potentialMean = DRAFT_GENERATION.potential.mean + classQualityOffset;
  prospect.hidden.potential = Math.round(rng.gaussian(potentialMean, DRAFT_GENERATION.potential.stdDev, 0, 99));

  return prospect;
}

/**
 * Génère une classe de draft (~60-70 prospects, spec plan P3 §Session 2).
 * `referenceDate` fixe l'âge des prospects (18-22 ans "aujourd'hui" dans la
 * ligue) ; `classQualityOffset` (voir `drawDraftClassQualityOffset`) module la
 * moyenne de potentiel de toute la promotion.
 */
export function generateDraftClass(rng: RNG, referenceDate: string, classQualityOffset: number): Player[] {
  const size = rng.int(DRAFT_GENERATION.classSize.min, DRAFT_GENERATION.classSize.max);
  const prospects: Player[] = [];
  for (let i = 0; i < size; i++) {
    prospects.push(generateProspect(rng, referenceDate, classQualityOffset));
  }
  return prospects;
}
