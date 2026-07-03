/**
 * Classement et tie-breakers (spec-tests-phase1.md §1 "Saison et playoffs").
 * Ordre des critères de départage non fixé par la spec — décision documentée
 * dans docs/decisions.md ("Ordre des tie-breakers du classement") :
 * win% → confrontation directe → division → conférence → point différentiel
 * → hash déterministe (jamais Math.random, CLAUDE.md).
 */
import type { Game, League, Team } from "../types/index.js";

export interface TeamStanding {
  teamId: string;
  wins: number;
  losses: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
}

function baseStandings(games: readonly Game[], teams: readonly Team[]): Map<string, TeamStanding> {
  const table = new Map<string, TeamStanding>();
  for (const team of teams) {
    table.set(team.id, {
      teamId: team.id,
      wins: 0,
      losses: 0,
      winPct: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifferential: 0,
    });
  }

  for (const game of games) {
    if (game.status !== "FINAL") continue;
    const home = table.get(game.homeTeamId);
    const away = table.get(game.awayTeamId);
    if (!home || !away) continue;

    home.pointsFor += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.pointsFor += game.awayScore;
    away.pointsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.wins++;
      away.losses++;
    } else {
      away.wins++;
      home.losses++;
    }
  }

  for (const standing of table.values()) {
    const total = standing.wins + standing.losses;
    standing.winPct = total > 0 ? standing.wins / total : 0;
    standing.pointDifferential = standing.pointsFor - standing.pointsAgainst;
  }

  return table;
}

function winPctBetween(games: readonly Game[], teamIds: readonly string[]): Map<string, number> {
  const idSet = new Set(teamIds);
  const wins = new Map<string, number>();
  const total = new Map<string, number>();
  for (const id of teamIds) {
    wins.set(id, 0);
    total.set(id, 0);
  }
  for (const game of games) {
    if (game.status !== "FINAL") continue;
    if (!idSet.has(game.homeTeamId) || !idSet.has(game.awayTeamId)) continue;
    total.set(game.homeTeamId, (total.get(game.homeTeamId) ?? 0) + 1);
    total.set(game.awayTeamId, (total.get(game.awayTeamId) ?? 0) + 1);
    if (game.homeScore > game.awayScore) wins.set(game.homeTeamId, (wins.get(game.homeTeamId) ?? 0) + 1);
    else wins.set(game.awayTeamId, (wins.get(game.awayTeamId) ?? 0) + 1);
  }
  const pct = new Map<string, number>();
  for (const id of teamIds) {
    const t = total.get(id) ?? 0;
    pct.set(id, t > 0 ? (wins.get(id) ?? 0) / t : 0.5); // pas de confrontation : neutre
  }
  return pct;
}

function deterministicTiebreak(teamId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < teamId.length; i++) {
    h ^= teamId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Calcule le classement complet, trié avec tie-breakers, pour l'ensemble
 * des équipes de la ligue (le tri par conférence/division se fait en filtrant
 * le résultat).
 */
export function computeStandings(games: readonly Game[], league: League): TeamStanding[] {
  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  const table = baseStandings(games, league.teams);
  const standings = [...table.values()];

  // Regroupe par winPct identique pour appliquer les tie-breakers uniquement
  // au sein des groupes à égalité stricte.
  const byWinPct = new Map<number, TeamStanding[]>();
  for (const s of standings) {
    const group = byWinPct.get(s.winPct) ?? [];
    group.push(s);
    byWinPct.set(s.winPct, group);
  }

  const resolvedGroups: TeamStanding[][] = [];
  for (const group of byWinPct.values()) {
    if (group.length === 1) {
      resolvedGroups.push(group);
      continue;
    }
    const ids = group.map((s) => s.teamId);
    const headToHead = winPctBetween(games, ids);

    const sorted = [...group].sort((a, b) => {
      const h2h = (headToHead.get(b.teamId) ?? 0.5) - (headToHead.get(a.teamId) ?? 0.5);
      if (h2h !== 0) return h2h;

      const teamA = teamById.get(a.teamId) as Team;
      const teamB = teamById.get(b.teamId) as Team;
      if (teamA.division === teamB.division) {
        const divIds = league.teams.filter((t) => t.division === teamA.division).map((t) => t.id);
        const divPct = winPctBetween(games, divIds);
        const diff = (divPct.get(b.teamId) ?? 0) - (divPct.get(a.teamId) ?? 0);
        if (diff !== 0) return diff;
      }
      if (teamA.conference === teamB.conference) {
        const confIds = league.teams.filter((t) => t.conference === teamA.conference).map((t) => t.id);
        const confPct = winPctBetween(games, confIds);
        const diff = (confPct.get(b.teamId) ?? 0) - (confPct.get(a.teamId) ?? 0);
        if (diff !== 0) return diff;
      }
      const pointDiff = b.pointDifferential - a.pointDifferential;
      if (pointDiff !== 0) return pointDiff;

      return deterministicTiebreak(a.teamId) - deterministicTiebreak(b.teamId);
    });
    resolvedGroups.push(sorted);
  }

  resolvedGroups.sort((a, b) => (b[0] as TeamStanding).winPct - (a[0] as TeamStanding).winPct);
  return resolvedGroups.flat();
}

export function standingsForConference(standings: readonly TeamStanding[], league: League, conference: string): TeamStanding[] {
  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  return standings.filter((s) => (teamById.get(s.teamId) as Team).conference === conference);
}
