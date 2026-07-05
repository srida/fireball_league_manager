import type { Player } from "./player.js";

/** Rythme de jeu voulu par le staff (spec-tests-phase1 / plan P2 §Session 1). */
export type Pace = "SLOW" | "NORMAL" | "FAST";

/** Orientation offensive : où l'équipe cherche à générer ses tirs. */
export type OffensiveOrientation = "THREE_POINT" | "BALANCED" | "INSIDE";

/** Agressivité défensive : intensité du contact et des prises de risque en défense. */
export type DefensiveAggressiveness = "LOW" | "NORMAL" | "HIGH";

/**
 * Profil tactique d'équipe (P2, plan-développement §Phase 2). Modifie les poids
 * du choix d'action et la consommation d'horloge (constantes dans tuning.ts),
 * jamais de logique dispersée dans le moteur.
 */
export interface TeamTactics {
  pace: Pace;
  offensiveOrientation: OffensiveOrientation;
  defensiveAggressiveness: DefensiveAggressiveness;
  /** Pressing tout terrain : accentue l'agressivité défensive (turnovers forcés, fautes). */
  pressing: boolean;
}

export interface Team {
  id: string;
  name: string; // nom fictif FBL
  city: string; // ville fictive FBL
  abbreviation: string; // 3 lettres
  conference: string;
  division: string;
  roster: Player[]; // 15 joueurs en P1
  /** Profil tactique (P2). Assigné à la génération de la ligue selon la composition du roster. */
  tactics: TeamTactics;
  /** Curseur de budget scouting (0-1, P3 §Session 3) — trait d'identité de franchise, assigné à la génération. */
  scoutingQuality: number;
  /** Biais d'évaluation systématique de l'équipe (points d'overall apparent, peut être négatif) — "certaines équipes scoutent mal". */
  scoutingBias: number;
}

export interface Division {
  name: string;
  conference: string;
}

export interface League {
  id: string;
  seed: string;
  conferences: string[]; // 2
  divisions: Division[]; // 6, 3 par conférence
  teams: Team[]; // 30, 5 par division
}
