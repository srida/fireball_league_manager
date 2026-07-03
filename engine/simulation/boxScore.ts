/**
 * Agrégation du log d'événements en box score (spec-possession-algorithm.md §9 :
 * "Box score = agrégation du log. Stats avancées ... = formules standard
 * appliquées au log."). Jamais calculé à part du log — principe non négociable.
 */
import type { Event } from "../types/index.js";

export interface PlayerBoxScore {
  playerId: string;
  points: number;
  fgm: number;
  fga: number;
  threePM: number;
  threePA: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  minutes: number;
}

function emptyBoxScore(playerId: string): PlayerBoxScore {
  return {
    playerId,
    points: 0,
    fgm: 0,
    fga: 0,
    threePM: 0,
    threePA: 0,
    ftm: 0,
    fta: 0,
    oreb: 0,
    dreb: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
    minutes: 0,
  };
}

/**
 * Agrège le log d'événements d'un match en box score par joueur (spec §9).
 * `minutesByPlayer` est fourni séparément : en P1 ce n'est pas dérivable du
 * log (pas d'événements SUB), c'est le modèle de minutes naïf (game.ts).
 */
export function aggregateBoxScore(
  events: readonly Event[],
  minutesByPlayer: Readonly<Record<string, number>>,
): Record<string, PlayerBoxScore> {
  const table: Record<string, PlayerBoxScore> = {};
  const get = (id: string): PlayerBoxScore => (table[id] ??= emptyBoxScore(id));

  for (const event of events) {
    switch (event.t) {
      case "SHOT": {
        const shooter = get(event.player);
        shooter.fga++;
        if (event.shotType === "THREE") shooter.threePA++;
        if (event.result === "MAKE") {
          shooter.fgm++;
          if (event.shotType === "THREE") shooter.threePM++;
          shooter.points += event.shotType === "THREE" ? 3 : 2;
          if (event.assistBy) get(event.assistBy).ast++;
        } else if (event.result === "BLOCK" && event.blockedBy) {
          get(event.blockedBy).blk++;
        }
        break;
      }
      case "REBOUND": {
        const rebounder = get(event.player);
        rebounder.reb++;
        if (event.side === "OFF") rebounder.oreb++;
        else rebounder.dreb++;
        break;
      }
      case "TURNOVER": {
        get(event.player).tov++;
        if (event.cause === "STEAL" && event.stealBy) get(event.stealBy).stl++;
        break;
      }
      case "FOUL": {
        get(event.player).pf++;
        break;
      }
      case "FREE_THROW": {
        const shooter = get(event.player);
        shooter.fta++;
        if (event.result === "MAKE") {
          shooter.ftm++;
          shooter.points += 1;
        }
        break;
      }
      case "SUB":
        break; // P2
    }
  }

  for (const [playerId, minutes] of Object.entries(minutesByPlayer)) {
    get(playerId).minutes = minutes;
  }

  return table;
}

export function sumTeamBoxScore(playerBoxScores: readonly PlayerBoxScore[]): Omit<PlayerBoxScore, "playerId" | "minutes"> {
  return playerBoxScores.reduce(
    (team, p) => ({
      points: team.points + p.points,
      fgm: team.fgm + p.fgm,
      fga: team.fga + p.fga,
      threePM: team.threePM + p.threePM,
      threePA: team.threePA + p.threePA,
      ftm: team.ftm + p.ftm,
      fta: team.fta + p.fta,
      oreb: team.oreb + p.oreb,
      dreb: team.dreb + p.dreb,
      reb: team.reb + p.reb,
      ast: team.ast + p.ast,
      stl: team.stl + p.stl,
      blk: team.blk + p.blk,
      tov: team.tov + p.tov,
      pf: team.pf + p.pf,
    }),
    { points: 0, fgm: 0, fga: 0, threePM: 0, threePA: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 },
  );
}

/** eFG% = (FGM + 0.5·3PM) / FGA — formule standard. */
export function effectiveFieldGoalPercentage(fgm: number, threePM: number, fga: number): number {
  if (fga === 0) return 0;
  return (fgm + 0.5 * threePM) / fga;
}

/** TS% = PTS / (2·(FGA + 0.44·FTA)) — formule standard. */
export function trueShootingPercentage(points: number, fga: number, fta: number): number {
  const denom = 2 * (fga + 0.44 * fta);
  if (denom === 0) return 0;
  return points / denom;
}

/**
 * USG% standard (Dean Oliver) : part des possessions d'équipe "utilisées" par
 * le joueur pendant ses minutes sur le terrain.
 * USG% = 100 × ((FGA + 0.44·FTA + TOV) × (TmMin/5)) / (Min × (TmFGA + 0.44·TmFTA + TmTOV))
 */
export function usagePercentage(
  player: { fga: number; fta: number; tov: number; minutes: number },
  team: { fga: number; fta: number; tov: number; minutes: number },
): number {
  const denom = player.minutes * (team.fga + 0.44 * team.fta + team.tov);
  if (denom === 0) return 0;
  return (100 * (player.fga + 0.44 * player.fta + player.tov) * (team.minutes / 5)) / denom;
}

/**
 * ORtg/DRtg — P1 simplifiés au niveau équipe : contrairement au basket réel
 * (où le nombre de possessions est estimé), notre moteur événementiel connaît
 * le nombre exact de possessions jouées, donc ORtg = 100 × points / possessions.
 */
export function teamOffensiveRating(points: number, possessions: number): number {
  if (possessions === 0) return 0;
  return (100 * points) / possessions;
}

export function teamDefensiveRating(opponentPoints: number, opponentPossessions: number): number {
  return teamOffensiveRating(opponentPoints, opponentPossessions);
}

/** +/- : en P1 (pas de rotations), identique pour les 5 joueurs sur le terrain d'une équipe. */
export function plusMinus(teamPoints: number, opponentPoints: number): number {
  return teamPoints - opponentPoints;
}
