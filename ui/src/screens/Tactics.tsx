import { useState } from "react";
import {
  TACTICS_PACE_CLOCK_MULTIPLIER,
  TACTICS_OFFENSIVE_ORIENTATION_SHOT_BIAS,
  TACTICS_DEFENSIVE_AGGRESSIVENESS,
  TACTICS_PRESSING_MULTIPLIER,
  ROTATION,
} from "../../../engine/config/tuning.js";
import { playerRating } from "../../../engine/simulation/rotation.js";
import type { Franchise } from "../types.js";
import type { DefensiveAggressiveness, OffensiveOrientation, Pace } from "../../../engine/types/index.js";

const PACE_OPTIONS: { value: Pace; label: string; desc: string }[] = [
  { value: "SLOW", label: "Lent", desc: `Possessions plus longues (horloge ×${TACTICS_PACE_CLOCK_MULTIPLIER.SLOW}) — moins de possessions par match, chaque tir est plus travaillé.` },
  { value: "NORMAL", label: "Normal", desc: "Rythme standard de la ligue." },
  { value: "FAST", label: "Rapide", desc: `Possessions plus courtes (horloge ×${TACTICS_PACE_CLOCK_MULTIPLIER.FAST}) — plus de possessions par match, plus de tirs pris tôt.` },
];

const ORIENTATION_OPTIONS: { value: OffensiveOrientation; label: string; desc: string }[] = [
  {
    value: "THREE_POINT",
    label: "Tir extérieur",
    desc: `Favorise les tirs à 3pts (×${TACTICS_OFFENSIVE_ORIENTATION_SHOT_BIAS.THREE_POINT.three}), moins de tirs près du cercle (×${TACTICS_OFFENSIVE_ORIENTATION_SHOT_BIAS.THREE_POINT.rim}).`,
  },
  { value: "BALANCED", label: "Équilibré", desc: "Répartition standard entre tirs près du cercle, mi-distance et 3pts." },
  {
    value: "INSIDE",
    label: "Jeu intérieur",
    desc: `Favorise les tirs près du cercle (×${TACTICS_OFFENSIVE_ORIENTATION_SHOT_BIAS.INSIDE.rim}), moins de tirs à 3pts (×${TACTICS_OFFENSIVE_ORIENTATION_SHOT_BIAS.INSIDE.three}).`,
  },
];

const AGGRESSIVENESS_OPTIONS: { value: DefensiveAggressiveness; label: string; desc: string }[] = [
  {
    value: "LOW",
    label: "Prudente",
    desc: `Moins de turnovers forcés (×${TACTICS_DEFENSIVE_AGGRESSIVENESS.LOW.turnoverForcedMultiplier}) mais aussi moins de fautes concédées (×${TACTICS_DEFENSIVE_AGGRESSIVENESS.LOW.foulMultiplier}).`,
  },
  { value: "NORMAL", label: "Normale", desc: "Intensité défensive standard." },
  {
    value: "HIGH",
    label: "Agressive",
    desc: `Plus de turnovers forcés (×${TACTICS_DEFENSIVE_AGGRESSIVENESS.HIGH.turnoverForcedMultiplier}) mais aussi plus de fautes concédées (×${TACTICS_DEFENSIVE_AGGRESSIVENESS.HIGH.foulMultiplier}).`,
  },
];

export default function Tactics({ franchise }: { franchise: Franchise }) {
  const { league, userTeamId } = franchise;
  const found = league.teams.find((t) => t.id === userTeamId);
  if (!found) throw new Error("Tactics: équipe du joueur introuvable");
  const userTeam = found;

  const [, forceRender] = useState(0);

  function patch(next: Partial<typeof userTeam.tactics>): void {
    userTeam.tactics = { ...userTeam.tactics, ...next };
    forceRender((n) => n + 1);
  }

  const rotationOrder = [...userTeam.roster].sort((a, b) => playerRating(b) - playerRating(a));

  return (
    <div className="stack">
      <div>
        <div className="lbl">Rythme de jeu (pace)</div>
        <div className="stack" style={{ gap: 8 }}>
          {PACE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={"tactic-option" + (userTeam.tactics.pace === opt.value ? " on" : "")}
              onClick={() => patch({ pace: opt.value })}
            >
              <span className="t">{opt.label}</span>
              <span className="d">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="lbl">Orientation offensive</div>
        <div className="stack" style={{ gap: 8 }}>
          {ORIENTATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={"tactic-option" + (userTeam.tactics.offensiveOrientation === opt.value ? " on" : "")}
              onClick={() => patch({ offensiveOrientation: opt.value })}
            >
              <span className="t">{opt.label}</span>
              <span className="d">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="lbl">Agressivité défensive</div>
        <div className="stack" style={{ gap: 8 }}>
          {AGGRESSIVENESS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={"tactic-option" + (userTeam.tactics.defensiveAggressiveness === opt.value ? " on" : "")}
              onClick={() => patch({ defensiveAggressiveness: opt.value })}
            >
              <span className="t">{opt.label}</span>
              <span className="d">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="lbl">Pressing tout terrain</div>
        <button
          className={"tactic-option" + (userTeam.tactics.pressing ? " on" : "")}
          onClick={() => patch({ pressing: !userTeam.tactics.pressing })}
        >
          <span className="t">{userTeam.tactics.pressing ? "Activé" : "Désactivé"}</span>
          <span className="d">
            Ajoute un multiplicateur supplémentaire au-dessus de l'agressivité défensive
            (turnovers ×{TACTICS_PRESSING_MULTIPLIER.turnoverForcedMultiplier}, fautes ×{TACTICS_PRESSING_MULTIPLIER.foulMultiplier}) —
            use aussi davantage la fatigue de l'équipe.
          </span>
        </button>
      </div>

      <div>
        <div className="lbl">Rotations</div>
        <div className="card">
          <div style={{ fontSize: 12.5, color: "var(--fbl-text-secondary)", marginBottom: 10 }}>
            Les rotations sont gérées automatiquement par le staff selon le niveau de chaque joueur
            (minutes cibles sur les {ROTATION.rotationSize} premiers du roster). Substitutions manuelles
            possibles en direct pendant un match, sur l'écran Match live.
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {rotationOrder.slice(0, ROTATION.rotationSize).map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span>{i + 1}. {p.firstName} {p.lastName} <span style={{ color: "var(--fbl-text-disabled)" }}>· {p.position}</span></span>
                <span style={{ fontFamily: "var(--fbl-font-mono)", color: "var(--fbl-text-secondary)" }}>
                  ~{ROTATION.targetMinutesByRank[i] ?? 0} min
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
