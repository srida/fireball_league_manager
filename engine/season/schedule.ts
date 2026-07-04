/**
 * Calendrier de saison régulière (spec-tests-phase1.md §1 "Saison et playoffs",
 * plan-developpement-jeu-nba.md : "calendrier round-robin pondéré (division/conférence)").
 * Pondération non chiffrée par la spec — décision de construction documentée
 * dans docs/decisions.md ("Construction du calendrier").
 *
 * Construction (ligue 2 conférences × 3 divisions × 5 équipes) :
 * - 4 matchs contre chacun des 4 rivaux de division (16) — 2 dom/2 ext.
 * - Pour chaque paire de divisions d'une même conférence (3 paires par
 *   conférence), un graphe circulant sur Z5 répartit les 5×5 = 25 paires
 *   d'équipes en 3 "adversaires renforcés" (4 matchs, 2 dom/2 ext) et
 *   2 "adversaires de base" (3 matchs, 2 dom/1 ext ou 1 dom/2 ext, réparti
 *   par le même offset pour équilibrer chaque équipe à 2 dom/2 ext sur
 *   l'ensemble de ses 4 adversaires de base) → 6 adversaires à 4 matchs (24)
 *   + 4 adversaires à 3 matchs (12) = 36 par équipe.
 * - 2 matchs contre chacune des 15 équipes de l'autre conférence (30) — 1 dom/1 ext.
 * Total : 16 + 36 + 30 = 82. Home/away : 8+12+6+15 = 41 de chaque côté (vérifié par test).
 */
import { SCHEDULE } from "../config/tuning.js";
import type { League, Team } from "../types/index.js";

export interface Fixture {
  homeTeamId: string;
  awayTeamId: string;
  /** Date ISO du match (plan P2 §Session 4 — calendrier à jours réels). */
  date: string;
}

function groupByDivision(teams: readonly Team[]): Map<string, Team[]> {
  const map = new Map<string, Team[]>();
  for (const team of teams) {
    const list = map.get(team.division) ?? [];
    list.push(team);
    map.set(team.division, list);
  }
  return map;
}

interface UnscheduledFixture {
  homeTeamId: string;
  awayTeamId: string;
}

function addGames(fixtures: UnscheduledFixture[], home: Team, away: Team, homeGames: number, awayGames: number): void {
  for (let i = 0; i < homeGames; i++) fixtures.push({ homeTeamId: home.id, awayTeamId: away.id });
  for (let i = 0; i < awayGames; i++) fixtures.push({ homeTeamId: away.id, awayTeamId: home.id });
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Assigne une date de calendrier réelle à chaque match (plan P2 §Session 4),
 * pour permettre une vraie détection de back-to-back (au lieu du proxy
 * stochastique de la Session 2, `docs/decisions.md`). Algorithme glouton :
 * un nombre de matchs par jour est plafonné à `targetGamesPerDay` (dérivé de
 * `SCHEDULE.seasonLengthDays`, très inférieur au maximum physique de 15 —
 * sans ce plafond, l'algorithme programme jusqu'à 15 matchs/soir et épuise
 * les équipes reposées en un jour, forçant un back-to-back systématique le
 * lendemain). Deux passes par jour : d'abord les matchs dont aucune des deux
 * équipes n'a joué la veille (repos normal, majorité des cas réels) ; une
 * seconde passe n'autorise un back-to-back que pour compléter le quota du
 * jour si le pool reposé ne suffit pas. Ordre de construction préservé
 * (déterministe, pas de RNG : la seed de ligue pilote déjà toute la génération
 * en amont).
 */
function assignDates(fixtures: readonly UnscheduledFixture[]): Fixture[] {
  const remaining = [...fixtures];
  const scheduled: Fixture[] = [];
  const lastPlayedDay = new Map<string, number>();
  const targetGamesPerDay = Math.max(1, Math.round(fixtures.length / SCHEDULE.seasonLengthDays));
  let day = 0;

  while (remaining.length > 0) {
    const playedToday = new Set<string>();
    const date = addDays(SCHEDULE.seasonStartDate, day);
    let placedToday = 0;

    const placeEligible = (allowBackToBack: boolean): void => {
      for (let i = 0; i < remaining.length && placedToday < targetGamesPerDay; ) {
        const fixture = remaining[i] as UnscheduledFixture;
        if (playedToday.has(fixture.homeTeamId) || playedToday.has(fixture.awayTeamId)) {
          i++;
          continue;
        }
        const restedHome = lastPlayedDay.get(fixture.homeTeamId) !== day - 1;
        const restedAway = lastPlayedDay.get(fixture.awayTeamId) !== day - 1;
        if (!allowBackToBack && (!restedHome || !restedAway)) {
          i++;
          continue;
        }
        remaining.splice(i, 1);
        playedToday.add(fixture.homeTeamId);
        playedToday.add(fixture.awayTeamId);
        lastPlayedDay.set(fixture.homeTeamId, day);
        lastPlayedDay.set(fixture.awayTeamId, day);
        scheduled.push({ ...fixture, date });
        placedToday++;
      }
    };

    placeEligible(false);
    if (placedToday < targetGamesPerDay) placeEligible(true);
    day++;
  }

  return scheduled;
}

/** Génère le calendrier complet de la saison régulière (82 matchs/équipe). */
export function generateSchedule(league: League): Fixture[] {
  const fixtures: UnscheduledFixture[] = [];
  const divisionsByConference = new Map<string, string[]>();
  for (const division of league.divisions) {
    const list = divisionsByConference.get(division.conference) ?? [];
    list.push(division.name);
    divisionsByConference.set(division.conference, list);
  }

  const byDivision = groupByDivision(league.teams);

  // 1. Rivaux de division : 4 matchs (2 dom/2 ext).
  for (const [, teams] of byDivision) {
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        addGames(fixtures, teams[i] as Team, teams[j] as Team, 2, 2);
      }
    }
  }

  // 2. Paires de divisions au sein d'une même conférence : circulant Z5.
  for (const [, divisionNames] of divisionsByConference) {
    const pairs: [string, string][] = [
      [divisionNames[0] as string, divisionNames[1] as string],
      [divisionNames[1] as string, divisionNames[2] as string],
      [divisionNames[2] as string, divisionNames[0] as string],
    ];
    for (const [divA, divB] of pairs) {
      const teamsA = byDivision.get(divA) as Team[];
      const teamsB = byDivision.get(divB) as Team[];
      const n = teamsA.length; // 5

      for (let i = 0; i < n; i++) {
        for (let offset = 0; offset < n; offset++) {
          const j = (i + offset) % n;
          const teamA = teamsA[i] as Team;
          const teamB = teamsB[j] as Team;

          if (offset <= 2) {
            // Adversaire renforcé : 4 matchs, 2 dom / 2 ext.
            addGames(fixtures, teamA, teamB, 2, 2);
          } else if (offset === 3) {
            // Adversaire de base : 3 matchs, A hôte 2 fois.
            addGames(fixtures, teamA, teamB, 2, 1);
          } else {
            // offset === 4 : 3 matchs, B hôte 2 fois.
            addGames(fixtures, teamA, teamB, 1, 2);
          }
        }
      }
    }
  }

  // 3. Hors conférence : 2 matchs (1 dom/1 ext) contre chacune des 15 équipes.
  for (let i = 0; i < league.teams.length; i++) {
    for (let j = i + 1; j < league.teams.length; j++) {
      const teamA = league.teams[i] as Team;
      const teamB = league.teams[j] as Team;
      if (teamA.conference === teamB.conference) continue;
      addGames(fixtures, teamA, teamB, 1, 1);
    }
  }

  return assignDates(fixtures);
}
