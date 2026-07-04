import { useMemo, useState } from "react";
import { generateLeague } from "../../../engine/generation/league.js";
import { createRng } from "../../../engine/utils/rng.js";
import { createSeasonRunner } from "../../../engine/season/seasonRunner.js";
import { playerRating } from "../../../engine/simulation/rotation.js";
import { getDs } from "../ds.js";
import type { Franchise } from "../types.js";
import type { League, Team } from "../../../engine/types/index.js";

function randomSeed(): string {
  return `fblm-${Math.random().toString(36).slice(2, 10)}`;
}

function teamLevel(team: Team): number {
  const avg = team.roster.reduce((sum, p) => sum + playerRating(p), 0) / team.roster.length;
  return Math.round(avg);
}

export default function NewGame({ onStart }: { onStart: (franchise: Franchise) => void }) {
  const { Button, Input } = getDs();
  const [seedInput, setSeedInput] = useState("");
  const [previewSeed, setPreviewSeed] = useState<string>(() => randomSeed());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const league: League = useMemo(() => generateLeague(previewSeed), [previewSeed]);

  const byConference = useMemo(() => {
    const map = new Map<string, Map<string, Team[]>>();
    for (const team of league.teams) {
      if (!map.has(team.conference)) map.set(team.conference, new Map());
      const divisions = map.get(team.conference) as Map<string, Team[]>;
      if (!divisions.has(team.division)) divisions.set(team.division, []);
      (divisions.get(team.division) as Team[]).push(team);
    }
    return map;
  }, [league]);

  const selectedTeam = league.teams.find((t) => t.id === selectedTeamId) ?? null;

  function applySeed(): void {
    const next = seedInput.trim() || randomSeed();
    setPreviewSeed(next);
    setSelectedTeamId(null);
  }

  function handleStart(): void {
    if (!selectedTeam) return;
    const runner = createSeasonRunner(createRng(`${previewSeed}:season`), league);
    onStart({ league, userTeamId: selectedTeam.id, runner });
  }

  return (
    <div className="app-content stack" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
        <img src="/assets/logo-fbl.png" alt="FBL" style={{ height: 56, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "var(--fbl-font-display)", fontSize: 24, color: "var(--fbl-text-primary)", letterSpacing: ".04em" }}>
            NOUVELLE PARTIE
          </div>
          <div style={{ fontFamily: "var(--fbl-font-mono)", fontSize: 11, color: "var(--fbl-text-disabled)" }}>
            FIREBALL LEAGUE MANAGER
          </div>
        </div>
      </div>

      <div className="card">
        <div className="lbl">Seed de la ligue</div>
        <div className="row-wrap" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input
              placeholder={previewSeed}
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
            />
          </div>
          <Button variant="secondary" onClick={applySeed}>Générer</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSeedInput("");
              setPreviewSeed(randomSeed());
              setSelectedTeamId(null);
            }}
          >
            Aléatoire
          </Button>
        </div>
        <div style={{ marginTop: 8, fontFamily: "var(--fbl-font-mono)", fontSize: 11, color: "var(--fbl-text-disabled)" }}>
          Seed active : {previewSeed}
        </div>
      </div>

      <div>
        <div className="lbl">Choisissez votre franchise — {league.teams.length} équipes</div>
        <div className="stack">
          {[...byConference.entries()].map(([conference, divisions]) => (
            <div key={conference}>
              <div style={{ fontFamily: "var(--fbl-font-body)", fontWeight: 600, fontSize: 13, color: "var(--fbl-text-secondary)", marginBottom: 8 }}>
                {conference}
              </div>
              <div className="stack" style={{ gap: 10 }}>
                {[...divisions.entries()].map(([division, teams]) => (
                  <div key={division}>
                    <div style={{ fontFamily: "var(--fbl-font-mono)", fontSize: 10, letterSpacing: ".08em", color: "var(--fbl-text-disabled)", marginBottom: 6 }}>
                      {division.toUpperCase()}
                    </div>
                    <div className="team-grid">
                      {teams.map((team) => (
                        <button
                          key={team.id}
                          className={"team-pick" + (team.id === selectedTeamId ? " on" : "")}
                          onClick={() => setSelectedTeamId(team.id)}
                        >
                          <span className="name">{team.name}</span>
                          <span className="meta">{team.abbreviation} · niveau {teamLevel(team)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedTeam && (
        <div className="card">
          <div className="lbl">Aperçu du roster — {selectedTeam.name}</div>
          <div className="stack" style={{ gap: 6 }}>
            {[...selectedTeam.roster]
              .sort((a, b) => playerRating(b) - playerRating(a))
              .slice(0, 8)
              .map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{p.firstName} {p.lastName} <span style={{ color: "var(--fbl-text-disabled)" }}>· {p.position}</span></span>
                  <span style={{ fontFamily: "var(--fbl-font-mono)", color: "var(--fbl-text-secondary)" }}>{Math.round(playerRating(p))}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div style={{ position: "sticky", bottom: 16 }}>
        <Button block size="lg" disabled={!selectedTeam} onClick={handleStart}>
          {selectedTeam ? `Prendre les commandes des ${selectedTeam.name}` : "Sélectionnez une franchise"}
        </Button>
      </div>
    </div>
  );
}
