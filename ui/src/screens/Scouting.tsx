import { useMemo, useState } from "react";
import { createRng } from "../../../engine/utils/rng.js";
import { scoutRosterPlayer, type ScoutingSnapshot } from "../../../engine/market/scouting.js";
import { SUMMER_LEAGUE } from "../../../engine/config/tuning.js";
import { deriveAge } from "../../../engine/players/age.js";
import { getDs } from "../ds.js";
import type { Franchise } from "../types.js";
import type { Player } from "../../../engine/types/index.js";

const GROWTH_CURVE_LABEL: Record<string, string> = {
  early: "Précoce",
  standard: "Standard",
  late: "Tardif",
};

function fourchette(range: { min: number; max: number }): string {
  return `${Math.round(range.min)}–${Math.round(range.max)}`;
}

export default function Scouting({ franchise }: { franchise: Franchise }) {
  const { Badge } = getDs();
  const { league, userTeamId } = franchise;
  const found = league.teams.find((t) => t.id === userTeamId);
  if (!found) throw new Error("Scouting: équipe du joueur introuvable");
  const team = found;

  const [, forceRender] = useState(0);

  const youngPlayers = useMemo(
    () => team.roster.filter((p) => p.state.seasonsInLeague < SUMMER_LEAGUE.eligibleSeasons),
    [team.roster],
  );

  // Vue purement informative (pas de tirage qui affecte la partie) — seed stable
  // tant que le budget/roster ne change pas, pour éviter un scintillement des
  // fourchettes à chaque re-render.
  const reports = useMemo(() => {
    const rng = createRng(`${league.seed}-scouting-view-${team.id}-${team.scoutingQuality.toFixed(2)}`);
    const map = new Map<string, ScoutingSnapshot>();
    for (const player of youngPlayers) map.set(player.id, scoutRosterPlayer(rng, player, team, team.scoutingQuality));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `team.scoutingQuality` (valeur, pas la référence `team`) doit invalider le memo au changement de curseur.
  }, [league.seed, team, team.scoutingQuality, youngPlayers]);

  function setBudget(value: number): void {
    team.scoutingQuality = value;
    forceRender((n) => n + 1);
  }

  return (
    <div className="stack">
      <div>
        <div className="lbl">Budget scouting</div>
        <div className="card stack" style={{ gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: "var(--fbl-font-display)", fontSize: 26, color: "var(--fbl-text-primary)" }}>
              {Math.round(team.scoutingQuality * 100)}%
            </span>
            <Badge tone={team.scoutingQuality >= 0.7 ? "positive" : team.scoutingQuality >= 0.4 ? "neutral" : "caution"}>
              {team.scoutingQuality >= 0.7 ? "Département fort" : team.scoutingQuality >= 0.4 ? "Département correct" : "Département limité"}
            </Badge>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={team.scoutingQuality}
            onChange={(e) => setBudget(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--fbl-accent)" }}
            aria-label="Budget scouting"
          />
          <div style={{ fontSize: 12, color: "var(--fbl-text-secondary)" }}>
            Un budget plus élevé resserre les fourchettes d'évaluation des prospects de draft et de vos jeunes joueurs —
            jamais une certitude totale (plan-développement §Phase 3).
          </div>
        </div>
      </div>

      <div>
        <div className="lbl">Vos jeunes joueurs (&lt; {SUMMER_LEAGUE.eligibleSeasons} saisons) — projection scoutée</div>
        {youngPlayers.length === 0 ? (
          <div className="card" style={{ color: "var(--fbl-text-secondary)", fontSize: 13 }}>
            Aucun jeune joueur sur ce roster actuellement.
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {youngPlayers.map((player) => (
              <PlayerScoutingCard key={player.id} player={player} report={reports.get(player.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerScoutingCard({ player, report }: { player: Player; report: ScoutingSnapshot | undefined }) {
  const age = deriveAge(player.birthDate);
  return (
    <div className="card stack" style={{ gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--fbl-font-body)", fontWeight: 600, fontSize: 14 }}>
          {player.firstName} {player.lastName}
        </span>
        <span style={{ fontSize: 12, color: "var(--fbl-text-secondary)" }}>
          {player.position} · {age} ans · {GROWTH_CURVE_LABEL[player.hidden.growthCurve]}
        </span>
      </div>
      {report && (
        <div style={{ display: "flex", gap: 18, fontSize: 12.5 }}>
          <span style={{ color: "var(--fbl-text-secondary)" }}>
            Potentiel projeté : <span style={{ fontFamily: "var(--fbl-font-mono)", color: "var(--fbl-text-primary)" }}>{fourchette(report.potential)}</span>
          </span>
          <span style={{ color: "var(--fbl-text-secondary)" }}>
            Note apparente : <span style={{ fontFamily: "var(--fbl-font-mono)", color: "var(--fbl-text-primary)" }}>{Math.round(report.apparentValue)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
