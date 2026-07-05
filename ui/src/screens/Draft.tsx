import { getDs } from "../ds.js";
import type { DraftPickAssignment, DraftSession } from "../../../engine/market/draft.js";
import type { ScoutingReport } from "../../../engine/market/scouting.js";
import type { League } from "../../../engine/types/index.js";

/**
 * Big board (plan-développement §Phase 3 — Session 4 : "big board avec
 * fourchettes, sélection au tap, suivi live des picks IA"). Les prospects
 * affichés et leurs fourchettes viennent TOUJOURS de la perception de l'équipe
 * du joueur (`ownReports`) — jamais la vraie valeur, jamais la perception
 * d'une autre équipe.
 */
export default function Draft({
  session,
  ownReports,
  userTeamId,
  league,
  onUserPick,
}: {
  session: DraftSession;
  ownReports: ReadonlyMap<string, ScoutingReport> | undefined;
  userTeamId: string;
  league: League;
  onUserPick: (prospectId: string) => void;
}) {
  const { Badge } = getDs();
  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  const current = session.currentPick();
  const isUserTurn = current?.teamId === userTeamId;

  const board = [...session.availableProspects()].sort((a, b) => {
    const va = ownReports?.get(a.id)?.final.apparentValue ?? 0;
    const vb = ownReports?.get(b.id)?.final.apparentValue ?? 0;
    return vb - va;
  });

  const picksSoFar: DraftPickAssignment[] = [...session.result().picks].reverse();

  return (
    <div className="stack">
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="lbl" style={{ marginBottom: 2 }}>
            {current ? `Tour ${current.round} · Pick ${current.pickNumber}` : "Draft terminé"}
          </div>
          <div style={{ fontFamily: "var(--fbl-font-body)", fontWeight: 600, fontSize: 14 }}>
            {current ? teamById.get(current.teamId)?.name : "Tous les picks sont joués"}
          </div>
        </div>
        {isUserTurn && <Badge tone="accent">À vous de choisir</Badge>}
      </div>

      {isUserTurn && (
        <div>
          <div className="lbl">Big board — fourchettes selon votre scouting</div>
          <div className="stack" style={{ gap: 8 }}>
            {board.slice(0, 30).map((prospect) => {
              const report = ownReports?.get(prospect.id);
              return (
                <button
                  key={prospect.id}
                  className="tactic-option"
                  onClick={() => onUserPick(prospect.id)}
                  style={{ cursor: "pointer" }}
                >
                  <span className="t" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      {prospect.firstName} {prospect.lastName} <span style={{ color: "var(--fbl-text-disabled)" }}>· {prospect.position}</span>
                    </span>
                    <span style={{ fontFamily: "var(--fbl-font-mono)" }}>{report ? Math.round(report.final.apparentValue) : "—"}</span>
                  </span>
                  <span className="d">
                    Potentiel projeté : {report ? `${Math.round(report.final.potential.min)}–${Math.round(report.final.potential.max)}` : "inconnu"}
                    {report?.hidden && " · profil approfondi disponible"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="lbl">Picks (suivi live)</div>
        {picksSoFar.length === 0 ? (
          <div className="card" style={{ color: "var(--fbl-text-secondary)", fontSize: 13 }}>Aucun pick joué pour l'instant.</div>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {picksSoFar.slice(0, 20).map((pick) => (
              <div
                key={`${pick.round}-${pick.pickNumber}`}
                className="card"
                style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px" }}
              >
                <span style={{ fontSize: 12.5 }}>
                  <span style={{ color: "var(--fbl-text-disabled)", fontFamily: "var(--fbl-font-mono)" }}>
                    T{pick.round} P{pick.pickNumber}
                  </span>{" "}
                  {teamById.get(pick.teamId)?.abbreviation}
                  {pick.teamId === userTeamId && " (vous)"}
                </span>
                <span style={{ fontSize: 12.5, fontFamily: "var(--fbl-font-body)" }}>
                  {pick.prospect.firstName} {pick.prospect.lastName}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
