import { useMemo } from "react";
import { getDs, type StandingsRow } from "../ds.js";
import type { Franchise } from "../types.js";
import type { UpcomingGame } from "../../../engine/season/seasonRunner.js";
import type { TeamStanding } from "../../../engine/season/standings.js";

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleString("fr-FR", { month: "short", timeZone: "UTC" })}`;
}

export default function Hub({
  franchise,
  onPlayNextGame,
}: {
  franchise: Franchise;
  onPlayNextGame: (upcoming: UpcomingGame) => void;
}) {
  const { Button, Standings, InjuryBadge, Badge } = getDs();
  const { runner, league, userTeamId } = franchise;
  const userTeam = league.teams.find((t) => t.id === userTeamId);
  if (!userTeam) throw new Error("Hub: équipe du joueur introuvable");

  // Idempotent : simule automatiquement les matchs des autres équipes jusqu'au
  // prochain match du joueur, sans effet de bord si déjà à jour (seasonRunner.ts).
  const upcoming = useMemo(() => runner.advanceToNextGameOf(userTeamId), [runner, userTeamId]);

  const lastResults = runner.getLastResultsOf(userTeamId, 5);
  const backToBack = runner.isNextGameBackToBackFor(userTeamId);

  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  const confStandings: TeamStanding[] = runner.getConferenceStandings(userTeam.conference);
  const leader = confStandings[0];

  const standingsRows: StandingsRow[] = confStandings.map((s, i) => {
    const team = teamById.get(s.teamId);
    const gb = leader ? (leader.wins - s.wins + (s.losses - leader.losses)) / 2 : 0;
    return {
      rank: i + 1,
      abbr: team?.abbreviation ?? "???",
      name: team ? team.name : s.teamId,
      w: s.wins,
      l: s.losses,
      pct: s.winPct.toFixed(3).replace(/^0/, ""),
      gb: gb <= 0 ? "—" : gb.toFixed(1),
      mine: s.teamId === userTeamId,
    };
  });

  const userRank = confStandings.findIndex((s) => s.teamId === userTeamId) + 1;
  const userStanding = confStandings.find((s) => s.teamId === userTeamId);

  const userGamesPlayed = runner.finishedGames.filter((g) => g.homeTeamId === userTeamId || g.awayTeamId === userTeamId).length;
  const userGamesRemaining = runner.totalGamesFor(userTeamId) - userGamesPlayed;

  const injuredPlayers = userTeam.roster
    .map((p) => ({ player: p, availability: runner.getAvailability(p.id) }))
    .filter((x) => x.availability.injuryGamesRemaining > 0);

  const wins = lastResults.map((g) => (g.homeTeamId === userTeamId ? g.homeScore > g.awayScore : g.awayScore > g.homeScore));

  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi">
          <div className="v">{userStanding ? `${userStanding.wins}-${userStanding.losses}` : "0-0"}</div>
          <div className="k">Bilan · {userRank || "—"}e conf.</div>
        </div>
        <div className="kpi">
          <div className="v" style={{ color: wins[0] ? "var(--fbl-positive)" : "var(--fbl-negative)" }}>
            {lastResults.length > 0 ? (wins[0] ? "Victoire" : "Défaite") : "—"}
          </div>
          <div className="k">Dernier match</div>
        </div>
        <div className="kpi">
          <div className="v">{injuredPlayers.length}</div>
          <div className="k">Blessés</div>
        </div>
        <div className="kpi">
          <div className="v">{userGamesRemaining}</div>
          <div className="k">Matchs restants</div>
        </div>
      </div>

      <div>
        <div className="lbl">Prochain match</div>
        <div className="card stack" style={{ gap: 10 }}>
          {upcoming ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "var(--fbl-font-body)", fontWeight: 600, fontSize: 15 }}>
                    {upcoming.isHome ? "vs" : "@"} {teamById.get(upcoming.opponentTeamId)?.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fbl-text-secondary)" }}>{formatDate(upcoming.fixture.date)}</div>
                </div>
                {backToBack && <Badge tone="caution">Back-to-back</Badge>}
              </div>
              <Button onClick={() => onPlayNextGame(upcoming)}>Jouer le match</Button>
            </>
          ) : (
            <div style={{ color: "var(--fbl-text-secondary)" }}>Fin de la saison régulière.</div>
          )}
        </div>
      </div>

      {lastResults.length > 0 && (
        <div>
          <div className="lbl">Derniers résultats</div>
          <div className="stack" style={{ gap: 6 }}>
            {lastResults.map((g) => {
              const isHome = g.homeTeamId === userTeamId;
              const opponentId = isHome ? g.awayTeamId : g.homeTeamId;
              const won = isHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
              const us = isHome ? g.homeScore : g.awayScore;
              const them = isHome ? g.awayScore : g.homeScore;
              return (
                <div key={g.id} className="card" style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px" }}>
                  <span style={{ fontSize: 13 }}>{isHome ? "vs" : "@"} {teamById.get(opponentId)?.abbreviation}</span>
                  <span style={{ fontFamily: "var(--fbl-font-mono)", fontSize: 13, color: won ? "var(--fbl-positive)" : "var(--fbl-negative)" }}>
                    {won ? "V" : "D"} {us}-{them}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="lbl">Classement — {userTeam.conference}</div>
        <Standings teams={standingsRows} conference={userTeam.conference.replace(/^Conférence /, "")} />
      </div>

      <div>
        <div className="lbl">Infirmerie</div>
        {injuredPlayers.length === 0 ? (
          <div className="card" style={{ color: "var(--fbl-text-secondary)", fontSize: 13 }}>Aucun blessé.</div>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {injuredPlayers.map(({ player, availability }) => (
              <div key={player.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px" }}>
                <span style={{ fontSize: 13 }}>{player.firstName} {player.lastName}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <InjuryBadge status="OUT" />
                  <span style={{ fontFamily: "var(--fbl-font-mono)", fontSize: 12, color: "var(--fbl-text-secondary)" }}>
                    {availability.injuryGamesRemaining} match{availability.injuryGamesRemaining > 1 ? "s" : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
