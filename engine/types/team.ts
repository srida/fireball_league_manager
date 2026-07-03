import type { Player } from "./player.js";

export interface Team {
  id: string;
  name: string; // nom fictif FBL
  city: string; // ville fictive FBL
  abbreviation: string; // 3 lettres
  conference: string;
  division: string;
  roster: Player[]; // 15 joueurs en P1
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
