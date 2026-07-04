/**
 * Âge dérivé d'un joueur (spec-player-model.md §1 — "birthDate : Âge dérivé,
 * jamais stocké"). Extrait de `simulation/fatigue.ts` (Session 2) vers
 * `players/` (Session 1, phase 3) : le vieillissement multi-saisons a besoin
 * de faire avancer une date de référence saison après saison, une
 * responsabilité qui appartient au domaine joueur, pas à la simulation de match.
 */
import { PLAYER_GENERATION } from "../config/tuning.js";
import type { RNG } from "../utils/rng.js";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Âge dérivé au moment de `referenceDate` (défaut : date de génération de la ligue). */
export function deriveAge(birthDate: string, referenceDate: string = PLAYER_GENERATION.referenceDate): number {
  const ref = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const birth = new Date(`${birthDate}T00:00:00Z`).getTime();
  return Math.floor((ref - birth) / MS_PER_YEAR);
}

/**
 * Ajoute `years` années civiles à une date ISO (yyyy-mm-dd). Utilisé pour faire
 * avancer la "date de référence" de la ligue d'une saison à l'autre (batch,
 * intersaison) sans jamais modifier `birthDate` d'un joueur — un joueur ne
 * "re-naît" pas, c'est la date d'observation qui avance.
 */
export function addYears(dateIso: string, years: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** Écart en années civiles entre deux dates ISO (utilisé pour recaler une `birthDate` générée à une autre référence). */
export function yearsBetween(fromIso: string, toIso: string): number {
  return new Date(`${toIso}T00:00:00Z`).getUTCFullYear() - new Date(`${fromIso}T00:00:00Z`).getUTCFullYear();
}

/**
 * Tire une `birthDate` plausible pour un âge dans `ageRange`, relative à
 * `referenceDate` — utilisé partout où un joueur doit apparaître "déjà à cet
 * âge aujourd'hui" plutôt que suivre le pipeline standard de génération de
 * ligue (remplaçants d'intersaison, prospects de draft).
 */
export function randomBirthDateForAge(rng: RNG, referenceDate: string, ageRange: { min: number; max: number }): string {
  const age = rng.int(ageRange.min, ageRange.max);
  const ref = new Date(`${referenceDate}T00:00:00Z`);
  const birthYear = ref.getUTCFullYear() - age;
  const month = rng.int(0, 11);
  const day = rng.int(1, 28); // borne basse pour rester valide sur tous les mois
  return new Date(Date.UTC(birthYear, month, day)).toISOString().slice(0, 10);
}
