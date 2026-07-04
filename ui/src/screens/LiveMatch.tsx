import { useEffect, useState } from "react";
import { getDs, type BoxScoreRow, type PlayByPlayEvent } from "../ds.js";
import { aggregateBoxScore } from "../../../engine/simulation/boxScore.js";
import { computeOnFirePlayers } from "../../../engine/simulation/streaks.js";
import { LiveGameSession, type LiveSnapshot } from "../../../engine/simulation/liveGame.js";
import type { Franchise, PendingGame } from "../types.js";
import type { Event, GameState, Player, TeamSide, TeamTactics } from "../../../engine/types/index.js";

type Speed = "step" | "x2" | "x8";

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function eventLabel(event: Event, playerName: (id: string) => string): { text: string; type: PlayByPlayEvent["type"] } {
  switch (event.t) {
    case "SHOT": {
      const made = event.result === "MAKE";
      const kind = event.shotType === "THREE" ? "à 3pts" : event.shotType === "RIM" ? "au cercle" : "à mi-distance";
      if (event.result === "BLOCK") return { text: `${playerName(event.player)} contré ${kind}`, type: "block" };
      const assist = event.assistBy ? ` (passe de ${playerName(event.assistBy)})` : "";
      return {
        text: `${playerName(event.player)} ${made ? "marque" : "manque"} ${kind}${made ? assist : ""}`,
        type: made ? (event.shotType === "THREE" ? "three" : "score") : undefined,
      };
    }
    case "FREE_THROW":
      return { text: `${playerName(event.player)} lancer franc ${event.index}/${event.total} : ${event.result === "MAKE" ? "réussi" : "manqué"}`, type: undefined };
    case "TURNOVER":
      return { text: `${playerName(event.player)} perd le ballon${event.stealBy ? ` (interception ${playerName(event.stealBy)})` : ""}`, type: event.stealBy ? "steal" : "turnover" };
    case "FOUL":
      return { text: `Faute de ${playerName(event.player)} sur ${playerName(event.on)}`, type: "foul" };
    case "SUB":
      return { text: `Changement : ${playerName(event.in)} entre pour ${playerName(event.out)}`, type: "sub" };
    case "INJURY":
      return { text: `${playerName(event.player)} blessé (${event.severity})`, type: undefined };
    case "TIMEOUT":
      return { text: `Temps mort — ${event.side === "HOME" ? "domicile" : "extérieur"}`, type: "timeout" };
    case "REBOUND":
      return { text: `Rebond ${event.side === "OFF" ? "offensif" : "défensif"} — ${playerName(event.player)}`, type: undefined };
    default:
      return { text: "", type: undefined };
  }
}

export default function LiveMatch({
  franchise,
  pendingGame,
  onGameOver,
}: {
  franchise: Franchise;
  pendingGame: PendingGame | null;
  onGameOver: () => void;
}) {
  const { Button, ScoreBanner, PlayByPlay, BoxScore, Modal, ProgressBar, Tabs, Toast, ToastStack } = getDs();
  const upcoming = pendingGame?.upcoming ?? null;

  const [session] = useState<LiveGameSession | null>(() => (upcoming ? franchise.runner.startLiveGame(upcoming) : null));
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [liveState, setLiveState] = useState<GameState | null>(() => session?.getState() ?? null);
  const [speed, setSpeed] = useState<Speed>("step");
  const [autoScroll, setAutoScroll] = useState(true);
  const [tab, setTab] = useState<"pbp" | "box">("pbp");
  const [subSide, setSubSide] = useState<TeamSide | null>(null);
  const [tacticsSide, setTacticsSide] = useState<TeamSide | null>(null);
  const [toast, setToast] = useState<{ tone: "info" | "caution"; title: string; message: string } | null>(null);

  const mySide: TeamSide | null = upcoming ? (upcoming.isHome ? "HOME" : "AWAY") : null;

  function sync(): void {
    if (!session) return;
    setLiveState(session.getState());
  }

  useEffect(() => {
    if (!session || speed === "step") return;
    if (snapshot?.isOver) return;
    const intervalMs = speed === "x2" ? 220 : 45;
    const id = setInterval(() => {
      const snap = session.step();
      setSnapshot(snap);
      sync();
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, speed, snapshot?.isOver]);

  if (!upcoming || !session || !mySide) {
    return (
      <div className="stack">
        <div className="card">Aucun match en attente. Retournez sur la Franchise.</div>
        <Button onClick={onGameOver}>Retour</Button>
      </div>
    );
  }

  const rosterById = new Map<string, Player>();
  for (const p of upcoming.options.homeRoster) rosterById.set(p.id, p);
  for (const p of upcoming.options.awayRoster) rosterById.set(p.id, p);
  const playerName = (id: string): string => {
    const p = rosterById.get(id);
    return p ? `${p.firstName} ${p.lastName[0]}.` : id;
  };

  const homeTeam = franchise.league.teams.find((t) => t.id === upcoming.fixture.homeTeamId);
  const awayTeam = franchise.league.teams.find((t) => t.id === upcoming.fixture.awayTeamId);
  const homeAbbr = homeTeam?.abbreviation ?? "HOM";
  const awayAbbr = awayTeam?.abbreviation ?? "AWY";

  const result = session.getResult();
  const events = result.game.events;
  const onFire = computeOnFirePlayers(events);
  const box = aggregateBoxScore(events, result.minutesPlayed);

  const pbpEvents: PlayByPlayEvent[] = [...events]
    .map((event, i) => {
      const { text, type } = eventLabel(event, playerName);
      const isHomeEvent = "player" in event ? upcoming.options.homeRoster.some((p) => p.id === event.player) : event.t === "TIMEOUT" ? event.side === "HOME" : true;
      return {
        id: `ev-${i}`,
        clock: formatClock(event.clock),
        period: `Q${Math.min(result.game.quarter, 4)}`,
        team: isHomeEvent ? homeAbbr : awayAbbr,
        score: `${result.game.homeScore}-${result.game.awayScore}`,
        text,
        type,
        hot: "player" in event && onFire.has((event as { player: string }).player),
      };
    })
    .filter((e) => e.text)
    .reverse();

  function toBoxRow(playerId: string, hotSet: ReadonlySet<string>): BoxScoreRow {
    const b = box[playerId];
    const p = rosterById.get(playerId);
    return {
      name: p ? `${p.firstName} ${p.lastName}` : playerId,
      pos: p?.position ?? "",
      min: b ? b.minutes.toFixed(0) : "0",
      pts: b?.points ?? 0,
      reb: b?.reb ?? 0,
      ast: b?.ast ?? 0,
      fg: b ? `${b.fgm}-${b.fga}` : "0-0",
      tp: b ? `${b.threePM}-${b.threePA}` : "0-0",
      pm: 0,
      hot: hotSet.has(playerId),
    };
  }

  const boxHome = result.participants.HOME.map((p) => toBoxRow(p.id, onFire));
  const boxAway = result.participants.AWAY.map((p) => toBoxRow(p.id, onFire));

  function handleStep(): void {
    if (!session) return;
    setSnapshot(session.step());
    sync();
  }

  function handleInstant(): void {
    if (!session) return;
    let snap = session.step();
    while (!snap.isOver) snap = session.step();
    setSnapshot(snap);
    sync();
  }

  function handleTimeout(): void {
    if (!session || !mySide) return;
    const res = session.callTimeout(mySide);
    setSnapshot(res);
    sync();
    if (!res.granted) setToast({ tone: "caution", title: "Temps mort refusé", message: "Plus aucun temps mort disponible." });
  }

  function handleSubstitute(outId: string, inId: string): void {
    if (!session || !mySide) return;
    const event = session.substitute(mySide, outId, inId);
    sync();
    if (!event) setToast({ tone: "caution", title: "Substitution impossible", message: "Le joueur entrant n'est pas disponible." });
    setSubSide(null);
  }

  function handleTactics(next: TeamTactics): void {
    if (!session || !mySide) return;
    session.setTactics(mySide, next);
    sync();
    setTacticsSide(null);
  }

  function handleFinish(): void {
    if (!session || !upcoming) return;
    franchise.runner.commitGame(upcoming, session.getResult());
    onGameOver();
  }

  const isOver = snapshot?.isOver ?? false;
  const quarterLabel = liveState ? (liveState.quarter <= 4 ? `Q${liveState.quarter}` : `PROL. ${liveState.quarter - 4}`) : "Q1";
  const clockLabel = liveState ? formatClock(liveState.clockSeconds) : "12:00";

  return (
    <div className="stack">
      <ScoreBanner
        state={isOver ? "final" : "live"}
        period={quarterLabel}
        clock={clockLabel}
        away={{ abbr: awayAbbr, name: awayTeam?.name, score: result.game.awayScore, hot: result.game.awayScore > result.game.homeScore }}
        home={{ abbr: homeAbbr, name: homeTeam?.name, score: result.game.homeScore, hot: result.game.homeScore > result.game.awayScore }}
      />

      {isOver ? (
        <div className="card stack">
          <div style={{ fontFamily: "var(--fbl-font-display)", fontSize: 20 }}>Match terminé</div>
          <Button onClick={handleFinish}>Continuer</Button>
        </div>
      ) : (
        <div className="live-controls">
          {speed === "step" ? (
            <Button onClick={handleStep}>Possession suivante</Button>
          ) : (
            <Button variant="secondary" onClick={() => setSpeed("step")}>Pause</Button>
          )}
          <Button variant={speed === "x2" ? "primary" : "ghost"} onClick={() => setSpeed("x2")}>×2</Button>
          <Button variant={speed === "x8" ? "primary" : "ghost"} onClick={() => setSpeed("x8")}>×8</Button>
          <Button variant="ghost" onClick={handleInstant}>Résultat instantané</Button>
          <Button variant="secondary" onClick={handleTimeout} disabled={session.getTimeoutsRemaining(mySide) <= 0}>
            Temps mort ({session.getTimeoutsRemaining(mySide)})
          </Button>
          <Button variant="secondary" onClick={() => setSubSide(mySide)}>Changement</Button>
          <Button variant="secondary" onClick={() => setTacticsSide(mySide)}>Tactique</Button>
        </div>
      )}

      <div className="live-layout">
        <div>
          <Tabs
            tabs={[{ value: "pbp", label: "Play-by-play" }, { value: "box", label: "Box score" }]}
            value={tab}
            onChange={(v) => setTab(v as "pbp" | "box")}
          />
          {tab === "pbp" ? (
            <div className="stack" style={{ marginTop: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fbl-text-secondary)" }}>
                <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                Défilement automatique
              </label>
              <PlayByPlay events={autoScroll ? pbpEvents : pbpEvents} homeAbbr={homeAbbr} awayAbbr={awayAbbr} maxHeight={480} />
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <BoxScore
                state={isOver ? "final" : "live"}
                period={quarterLabel}
                clock={clockLabel}
                away={{ abbr: awayAbbr, score: result.game.awayScore }}
                home={{ abbr: homeAbbr, score: result.game.homeScore }}
                boxHome={boxHome}
                boxAway={boxAway}
              />
            </div>
          )}
        </div>

        {liveState && (
          <div className="card stack">
            <div className="lbl">Sur le terrain — {mySide === "HOME" ? homeAbbr : awayAbbr}</div>
            {liveState.onCourt[mySide].map((oc) => (
              <div key={oc.player.id} className="stamina-row">
                <span className="name">{oc.player.firstName} {oc.player.lastName[0]}. {onFire.has(oc.player.id) && "🔥"}</span>
                <span className="bar">
                  <ProgressBar
                    value={liveState.gameStamina[oc.player.id] ?? 100}
                    tone={(liveState.gameStamina[oc.player.id] ?? 100) < 40 ? "negative" : (liveState.gameStamina[oc.player.id] ?? 100) < 65 ? "caution" : "positive"}
                    size="sm"
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {subSide && liveState && (
        <Modal open onClose={() => setSubSide(null)} title="Changement" width={420}>
          <SubstitutionPicker
            side={subSide}
            state={liveState}
            homeRoster={upcoming.options.homeRoster}
            awayRoster={upcoming.options.awayRoster}
            onSubstitute={handleSubstitute}
          />
        </Modal>
      )}

      {tacticsSide && liveState && (
        <Modal open onClose={() => setTacticsSide(null)} title="Ajustement tactique" width={420}>
          <TacticsPicker current={liveState.tactics[tacticsSide]} onApply={handleTactics} />
        </Modal>
      )}

      {toast && (
        <ToastStack>
          <Toast tone={toast.tone} title={toast.title} message={toast.message} onClose={() => setToast(null)} />
        </ToastStack>
      )}
    </div>
  );
}

function SubstitutionPicker({
  side,
  state,
  homeRoster,
  awayRoster,
  onSubstitute,
}: {
  side: TeamSide;
  state: GameState;
  homeRoster: readonly Player[];
  awayRoster: readonly Player[];
  onSubstitute: (outId: string, inId: string) => void;
}) {
  const { Button } = getDs();
  const [outId, setOutId] = useState<string | null>(null);
  const roster = side === "HOME" ? homeRoster : awayRoster;
  const onCourtIds = new Set(state.onCourt[side].map((oc) => oc.player.id));
  const bench = roster.filter((p) => !onCourtIds.has(p.id) && !(p.id in state.injuries));

  return (
    <div className="stack">
      <div className="lbl">Sort du terrain</div>
      <div className="stack" style={{ gap: 6 }}>
        {state.onCourt[side].map((oc) => (
          <button
            key={oc.player.id}
            className={"tactic-option" + (outId === oc.player.id ? " on" : "")}
            onClick={() => setOutId(oc.player.id)}
          >
            <span className="t">{oc.player.firstName} {oc.player.lastName}</span>
            <span className="d">Stamina {Math.round(state.gameStamina[oc.player.id] ?? 100)}</span>
          </button>
        ))}
      </div>
      {outId && (
        <>
          <div className="lbl">Entre en jeu</div>
          <div className="stack" style={{ gap: 6, maxHeight: 260, overflowY: "auto" }}>
            {bench.map((p) => (
              <button key={p.id} className="tactic-option" onClick={() => onSubstitute(outId, p.id)}>
                <span className="t">{p.firstName} {p.lastName}</span>
                <span className="d">{p.position} · stamina {Math.round(state.gameStamina[p.id] ?? 100)}</span>
              </button>
            ))}
            {bench.length === 0 && <div style={{ color: "var(--fbl-text-secondary)", fontSize: 13 }}>Aucun remplaçant disponible.</div>}
          </div>
        </>
      )}
      <Button variant="ghost" onClick={() => setOutId(null)} disabled={!outId}>Annuler la sélection</Button>
    </div>
  );
}

function TacticsPicker({ current, onApply }: { current: TeamTactics; onApply: (next: TeamTactics) => void }) {
  const { Button } = getDs();
  const [draft, setDraft] = useState<TeamTactics>(current);

  return (
    <div className="stack">
      <div className="lbl">Rythme</div>
      <div className="row-wrap">
        {(["SLOW", "NORMAL", "FAST"] as const).map((v) => (
          <button key={v} className={"tactic-option" + (draft.pace === v ? " on" : "")} onClick={() => setDraft({ ...draft, pace: v })} style={{ flex: 1 }}>
            <span className="t">{v === "SLOW" ? "Lent" : v === "NORMAL" ? "Normal" : "Rapide"}</span>
          </button>
        ))}
      </div>
      <div className="lbl">Orientation offensive</div>
      <div className="row-wrap">
        {(["THREE_POINT", "BALANCED", "INSIDE"] as const).map((v) => (
          <button key={v} className={"tactic-option" + (draft.offensiveOrientation === v ? " on" : "")} onClick={() => setDraft({ ...draft, offensiveOrientation: v })} style={{ flex: 1 }}>
            <span className="t">{v === "THREE_POINT" ? "Extérieur" : v === "BALANCED" ? "Équilibré" : "Intérieur"}</span>
          </button>
        ))}
      </div>
      <div className="lbl">Agressivité défensive</div>
      <div className="row-wrap">
        {(["LOW", "NORMAL", "HIGH"] as const).map((v) => (
          <button key={v} className={"tactic-option" + (draft.defensiveAggressiveness === v ? " on" : "")} onClick={() => setDraft({ ...draft, defensiveAggressiveness: v })} style={{ flex: 1 }}>
            <span className="t">{v === "LOW" ? "Prudente" : v === "NORMAL" ? "Normale" : "Agressive"}</span>
          </button>
        ))}
      </div>
      <button className={"tactic-option" + (draft.pressing ? " on" : "")} onClick={() => setDraft({ ...draft, pressing: !draft.pressing })}>
        <span className="t">Pressing {draft.pressing ? "activé" : "désactivé"}</span>
      </button>
      <Button onClick={() => onApply(draft)}>Appliquer</Button>
    </div>
  );
}
