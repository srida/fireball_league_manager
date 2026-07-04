import { useState } from "react";
import type { Franchise, PendingGame, Screen } from "./types.js";
import NewGame from "./screens/NewGame.js";
import Hub from "./screens/Hub.js";
import LiveMatch from "./screens/LiveMatch.js";
import Tactics from "./screens/Tactics.js";

const NAV: { id: Screen; icon: string; label: string }[] = [
  { id: "hub", icon: "◆", label: "Franchise" },
  { id: "live", icon: "●", label: "Match live" },
  { id: "tactics", icon: "▤", label: "Tactiques" },
];

export default function App() {
  const [franchise, setFranchise] = useState<Franchise | null>(null);
  const [screen, setScreen] = useState<Screen>("new-game");
  const [pendingGame, setPendingGame] = useState<PendingGame | null>(null);

  if (!franchise) {
    return (
      <NewGame
        onStart={(f) => {
          setFranchise(f);
          setScreen("hub");
        }}
      />
    );
  }

  const userTeam = franchise.league.teams.find((t) => t.id === franchise.userTeamId);
  if (!userTeam) throw new Error("App: franchise.userTeamId introuvable dans la ligue");

  return (
    <div className="app-shell">
      <nav className="app-bottom-nav">
        {NAV.map((n) => (
          <button key={n.id} className={"nav" + (screen === n.id ? " on" : "")} onClick={() => setScreen(n.id)}>
            <span className="ico">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
      <div className="app-main">
        <div className="app-topbar">
          <img src="/assets/logo-fbl-icon.png" alt="" />
          <h1>{userTeam.name}</h1>
        </div>
        <div className="app-content">
          {screen === "hub" && (
            <Hub
              franchise={franchise}
              onPlayNextGame={(upcoming) => {
                setPendingGame({ upcoming });
                setScreen("live");
              }}
            />
          )}
          {screen === "live" && (
            <LiveMatch
              franchise={franchise}
              pendingGame={pendingGame}
              onGameOver={() => {
                setPendingGame(null);
                setScreen("hub");
              }}
            />
          )}
          {screen === "tactics" && <Tactics franchise={franchise} />}
        </div>
      </div>
    </div>
  );
}
