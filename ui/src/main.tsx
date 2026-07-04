import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";

// Le bundle du design system (_ds_bundle.js) est un script classique qui
// s'appuie sur un `React` global (voir ui_kits/fbl-manager/index.html, sa
// démo de référence). On pose le même React que celui utilisé par cette app
// AVANT de le charger, pour qu'il n'y ait qu'une seule instance de React (et
// donc des hooks cohérents) entre les composants DS et l'app.
(window as unknown as { React: typeof React }).React = React;

function loadDesignSystemBundle(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/_ds_bundle.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Échec du chargement de /_ds_bundle.js"));
    document.head.appendChild(script);
  });
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

loadDesignSystemBundle()
  .then(() => root.render(<App />))
  .catch((error: unknown) => {
    root.render(
      <div style={{ padding: 24, color: "#F5EFE0", fontFamily: "sans-serif" }}>
        Erreur de chargement du design system : {String(error)}
      </div>,
    );
  });
