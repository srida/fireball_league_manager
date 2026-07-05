/**
 * Intersaison (plan-développement §Phase 3 — Session 1) : progression/déclin
 * annuel de chaque joueur, retraites, purge des retraités. Appelé entre deux
 * saisons du harnais batch (`batch/run.ts`) — jamais pendant une saison, donc
 * sans effet sur le golden master (seed unique, une saison, `tests/golden`).
 *
 * Remplacement des retraités : en l'absence du draft (Session 2), un joueur
 * généré via `generatePlayer` (même génération qu'à la création de ligue) comble
 * le trou au même poste — filet temporaire documenté (docs/decisions.md), remplacé
 * par un vrai flux de rookies draftés en Session 2. Sa `birthDate` est retirée
 * (`DEVELOPMENT.replacementAgeRange`, 19-22 ans) plutôt que celle tirée par
 * `generatePlayer` (pleine fourchette [19,38]) : un batch de contrôle a montré
 * que des remplaçants pigés dans toute la fourchette ne renouvellent jamais la
 * ligue (un "remplaçant" peut être un vétéran de 35 ans) — l'âge moyen ne se
 * stabilisait jamais (docs/decisions.md).
 */
import { DEVELOPMENT, LEAGUE_GENERATION } from "../config/tuning.js";
import { archetypesForPosition, pickFreeJerseyNumber } from "../generation/roster.js";
import { generatePlayer } from "../generation/player.js";
import { deriveAge, randomBirthDateForAge } from "../players/age.js";
import { applyAnnualDevelopment, rollRetirement } from "../players/development.js";
import type { RNG } from "../utils/rng.js";
import { POSITIONS, type League, type Player } from "../types/index.js";

export interface RetiredPlayerRecord {
  player: Player;
  teamId: string;
  age: number;
}

export interface OffseasonResult {
  /** Date de référence (ISO) utilisée pour dériver l'âge de chaque joueur cette intersaison. */
  referenceDate: string;
  retirements: number;
  replacementsGenerated: number;
  leagueAverageAge: number;
  /**
   * Joueurs retraités cette intersaison, avant purge du roster (P3 §Session 4 :
   * "récapitulatif d'intersaison — retraites marquantes"). L'appelant filtre/trie
   * lui-même (ex. par `playerOverallRating` pour ne montrer que les "marquantes").
   */
  retiredPlayers: RetiredPlayerRecord[];
}

/**
 * Fait avancer la ligue d'une saison : progression/déclin de chaque joueur du
 * roster (mutation directe, même convention que `gameDriver`), retraites tirées
 * puis purgées, effectif ramené à `LEAGUE_GENERATION.rosterSize` par des
 * remplaçants génériques. `minutesByPlayer` vient de `SeasonResult` (saison qui
 * vient de se terminer) ; `referenceDate` est la date "actuelle" de la ligue
 * après cette intersaison (ex. `addYears(PLAYER_GENERATION.referenceDate, n)`).
 */
export function runOffseason(
  rng: RNG,
  league: League,
  minutesByPlayer: Readonly<Record<string, number>>,
  referenceDate: string,
): OffseasonResult {
  let retirements = 0;
  let replacementsGenerated = 0;
  const ages: number[] = [];
  const retiredPlayers: RetiredPlayerRecord[] = [];

  for (const team of league.teams) {
    const survivors: Player[] = [];

    for (const player of team.roster) {
      const age = deriveAge(player.birthDate, referenceDate);
      const minutesShare = Math.min(1, (minutesByPlayer[player.id] ?? 0) / DEVELOPMENT.referenceSeasonMinutes);
      applyAnnualDevelopment(player, age, minutesShare);

      if (rollRetirement(rng, player, age)) {
        retirements++;
        retiredPlayers.push({ player, teamId: team.id, age });
        continue;
      }
      // Une saison de plus dans la ligue (P3 §Session 4 : éligibilité Summer League).
      player.state.seasonsInLeague += 1;
      ages.push(age);
      survivors.push(player);
    }

    // Comble chaque poste jusqu'à `playersPerPositionOnRoster` (même répartition
    // qu'à la génération de ligue, roster.ts) plutôt qu'un simple compteur global
    // — préserve l'équilibre des postes sur le roster au fil des retraites.
    for (const position of POSITIONS) {
      const countAtPosition = survivors.filter((p) => p.position === position).length;
      for (let i = countAtPosition; i < LEAGUE_GENERATION.playersPerPositionOnRoster; i++) {
        const archetypeId = rng.pick(archetypesForPosition(position));
        const rookie = generatePlayer(rng, archetypeId, position);
        rookie.birthDate = randomBirthDateForAge(rng, referenceDate, DEVELOPMENT.replacementAgeRange);
        rookie.jerseyNumber = pickFreeJerseyNumber(rng, survivors);
        survivors.push(rookie);
        replacementsGenerated++;
        ages.push(deriveAge(rookie.birthDate, referenceDate));
      }
    }

    team.roster = survivors;
  }

  const leagueAverageAge = ages.reduce((a, b) => a + b, 0) / ages.length;
  return { referenceDate, retirements, replacementsGenerated, leagueAverageAge, retiredPlayers };
}
