import { useRef, useState } from "react";
import { createRng, type RNG } from "../../../engine/utils/rng.js";
import { PLAYER_GENERATION } from "../../../engine/config/tuning.js";
import { addYears } from "../../../engine/players/age.js";
import { runOffseason, type OffseasonResult } from "../../../engine/season/offseason.js";
import { generateDraftClass, drawDraftClassQualityOffset } from "../../../engine/generation/draftClass.js";
import { applyDraftToRosters, computeDraftOrder, createDraftSession, type DraftSession } from "../../../engine/market/draft.js";
import { scoutDraftClassForLeague, type ScoutingReport } from "../../../engine/market/scouting.js";
import { runSummerLeague, type SummerLeagueResult } from "../../../engine/season/summerLeague.js";
import { createSeasonRunner } from "../../../engine/season/seasonRunner.js";
import { playerOverallRating } from "../../../engine/players/development.js";
import { getDs } from "../ds.js";
import DraftScreen from "./Draft.js";
import type { Franchise } from "../types.js";

interface FlowState {
  rng: RNG;
  referenceDate: string;
  offseason: OffseasonResult;
  draftClassSize: number;
  draftClassQualityOffset: number;
  session: DraftSession;
  reportsByTeam: Map<string, Map<string, ScoutingReport>>;
}

type Step = "offseason-recap" | "draft" | "final-recap";

/** Résout automatiquement tous les picks des équipes IA jusqu'au prochain tour du joueur (ou fin du draft). */
function autoResolveUntilUserTurn(session: DraftSession, userTeamId: string): void {
  while (!session.isComplete()) {
    const slot = session.currentPick();
    if (!slot || slot.teamId === userTeamId) return;
    session.makePick();
  }
}

export default function Intersaison({ franchise, onComplete }: { franchise: Franchise; onComplete: (next: Franchise) => void }) {
  const { Button } = getDs();
  const { league, userTeamId, seasonIndex, runner } = franchise;

  const [step, setStep] = useState<Step>("offseason-recap");
  const [, forceRender] = useState(0);
  const [summerLeagueResult, setSummerLeagueResult] = useState<SummerLeagueResult | null>(null);

  // Boucle annuelle (plan-développement §Phase 3 — Session 4 : "fin de playoffs →
  // retraites → lottery → draft → Summer League → nouvelle saison"). Calculée une
  // seule fois à l'entrée sur cet écran (lazy ref, pas un useEffect) : offseason +
  // classe de draft + lottery + scouting + session de draft interactive, tout de
  // suite auto-résolue jusqu'au premier tour du joueur.
  const flowRef = useRef<FlowState | null>(null);
  if (!flowRef.current) {
    const rng = createRng(`${league.seed}-annual-${seasonIndex}`);
    const referenceDate = addYears(PLAYER_GENERATION.referenceDate, seasonIndex + 1);
    const offseason = runOffseason(rng, league, runner.getMinutesByPlayer(), referenceDate);

    const draftClassQualityOffset = drawDraftClassQualityOffset(rng);
    const prospects = generateDraftClass(rng, referenceDate, draftClassQualityOffset);
    const order = computeDraftOrder(rng, runner.getStandings());
    const reportsByTeam = scoutDraftClassForLeague(rng, prospects, league.teams);
    const session = createDraftSession(order, prospects, reportsByTeam, league.teams);
    autoResolveUntilUserTurn(session, userTeamId);

    flowRef.current = {
      rng,
      referenceDate,
      offseason,
      draftClassSize: prospects.length,
      draftClassQualityOffset,
      session,
      reportsByTeam,
    };
  }
  const flow = flowRef.current;

  function handleUserPick(prospectId: string): void {
    flow.session.makePick(prospectId);
    autoResolveUntilUserTurn(flow.session, userTeamId);
    if (flow.session.isComplete()) finishDraft();
    else forceRender((n) => n + 1);
  }

  function finishDraft(): void {
    applyDraftToRosters(flow.rng, league, flow.session.result());
    const summerLeague = runSummerLeague(flow.rng, league);
    setSummerLeagueResult(summerLeague);
    setStep("final-recap");
  }

  function handleStartNewSeason(): void {
    const nextSeasonIndex = seasonIndex + 1;
    const newRunner = createSeasonRunner(createRng(`${league.seed}:season-${nextSeasonIndex}`), league);
    onComplete({ league, userTeamId, runner: newRunner, seasonIndex: nextSeasonIndex });
  }

  const notableRetirees = [...flow.offseason.retiredPlayers]
    .sort((a, b) => playerOverallRating(b.player) - playerOverallRating(a.player))
    .slice(0, 5);

  const userDraftPicks = flow.session.result().picks.filter((p) => p.teamId === userTeamId);
  const summerLeagueForUserTeam = summerLeagueResult?.participants.filter((p) => p.teamId === userTeamId) ?? [];

  return (
    <div className="stack">
      {step === "offseason-recap" && (
        <>
          <div>
            <div className="lbl">Récapitulatif d'intersaison</div>
            <div className="kpis">
              <div className="kpi">
                <div className="v">{flow.offseason.retirements}</div>
                <div className="k">Retraites</div>
              </div>
              <div className="kpi">
                <div className="v">{flow.offseason.leagueAverageAge.toFixed(1)}</div>
                <div className="k">Âge moyen ligue</div>
              </div>
              <div className="kpi">
                <div className="v">{flow.draftClassSize}</div>
                <div className="k">Prospects en classe</div>
              </div>
              <div className="kpi">
                <div className="v">{flow.draftClassQualityOffset >= 0 ? "+" : ""}{flow.draftClassQualityOffset.toFixed(1)}</div>
                <div className="k">Qualité de cuvée</div>
              </div>
            </div>
          </div>

          <div>
            <div className="lbl">Retraites marquantes</div>
            {notableRetirees.length === 0 ? (
              <div className="card" style={{ color: "var(--fbl-text-secondary)", fontSize: 13 }}>Aucune retraite notable cette saison.</div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {notableRetirees.map(({ player, teamId, age }) => (
                  <div key={player.id} className="card" style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px" }}>
                    <span style={{ fontSize: 13 }}>
                      {player.firstName} {player.lastName}{" "}
                      <span style={{ color: "var(--fbl-text-disabled)" }}>· {age} ans · {league.teams.find((t) => t.id === teamId)?.abbreviation}</span>
                    </span>
                    <span style={{ fontFamily: "var(--fbl-font-mono)", fontSize: 12.5, color: "var(--fbl-text-secondary)" }}>
                      {Math.round(playerOverallRating(player))} ovr
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button block size="lg" onClick={() => setStep("draft")}>
            Passer à la Draft
          </Button>
        </>
      )}

      {step === "draft" && (
        <>
          <DraftScreen
            session={flow.session}
            ownReports={flow.reportsByTeam.get(userTeamId)}
            userTeamId={userTeamId}
            league={league}
            onUserPick={handleUserPick}
          />
          {flow.session.isComplete() && (
            <Button block size="lg" onClick={() => setStep("final-recap")}>
              Voir le résumé
            </Button>
          )}
        </>
      )}

      {step === "final-recap" && (
        <>
          <div>
            <div className="lbl">Vos picks de draft</div>
            {userDraftPicks.length === 0 ? (
              <div className="card" style={{ color: "var(--fbl-text-secondary)", fontSize: 13 }}>Aucun pick cette année.</div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {userDraftPicks.map((pick) => (
                  <div key={`${pick.round}-${pick.pickNumber}`} className="card" style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px" }}>
                    <span style={{ fontSize: 13 }}>
                      {pick.prospect.firstName} {pick.prospect.lastName} <span style={{ color: "var(--fbl-text-disabled)" }}>· {pick.prospect.position}</span>
                    </span>
                    <span style={{ fontFamily: "var(--fbl-font-mono)", fontSize: 12, color: "var(--fbl-text-secondary)" }}>
                      T{pick.round} P{pick.pickNumber}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="lbl">Summer League — vos jeunes</div>
            {summerLeagueForUserTeam.length === 0 ? (
              <div className="card" style={{ color: "var(--fbl-text-secondary)", fontSize: 13 }}>Aucun jeune joueur éligible cette année.</div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {summerLeagueForUserTeam.map((participant) => {
                  const player = league.teams.find((t) => t.id === userTeamId)?.roster.find((p) => p.id === participant.playerId);
                  return (
                    <div key={participant.playerId} className="card" style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px" }}>
                      <span style={{ fontSize: 13 }}>{player ? `${player.firstName} ${player.lastName}` : participant.playerId}</span>
                      <span style={{ fontFamily: "var(--fbl-font-mono)", fontSize: 12.5, color: "var(--fbl-text-secondary)" }}>
                        Note : {Math.round(participant.performanceGrade)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Button block size="lg" onClick={handleStartNewSeason}>
            Démarrer la nouvelle saison
          </Button>
        </>
      )}
    </div>
  );
}
