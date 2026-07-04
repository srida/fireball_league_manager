/* @ds-bundle: {"format":4,"namespace":"FBLFireballLeagueDesignSystem_5f42ba","components":[{"name":"BoxScore","sourcePath":"components/data/BoxScore.jsx"},{"name":"CapSheet","sourcePath":"components/data/CapSheet.jsx"},{"name":"PlayByPlay","sourcePath":"components/data/PlayByPlay.jsx"},{"name":"PlayerCard","sourcePath":"components/data/PlayerCard.jsx"},{"name":"RatingBadge","sourcePath":"components/data/RatingBadge.jsx"},{"name":"ScoreBanner","sourcePath":"components/data/ScoreBanner.jsx"},{"name":"Standings","sourcePath":"components/data/Standings.jsx"},{"name":"StatTable","sourcePath":"components/data/StatTable.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"PositionBadge","sourcePath":"components/feedback/Badge.jsx"},{"name":"InjuryBadge","sourcePath":"components/feedback/Badge.jsx"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"ProgressBar","sourcePath":"components/feedback/ProgressBar.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"ToastStack","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/data/BoxScore.jsx":"9ebe26d79210","components/data/CapSheet.jsx":"9471cd3ce16d","components/data/PlayByPlay.jsx":"39f4130ecd4c","components/data/PlayerCard.jsx":"56b63f572e5c","components/data/RatingBadge.jsx":"0b60749d89d2","components/data/ScoreBanner.jsx":"45889c6c5b08","components/data/Standings.jsx":"6424cc1464d2","components/data/StatTable.jsx":"df4bee7fbc58","components/feedback/Badge.jsx":"d746546eddb7","components/feedback/Modal.jsx":"8e279c6655fa","components/feedback/ProgressBar.jsx":"33ce39f63acf","components/feedback/Toast.jsx":"ea3ac8d577cc","components/feedback/Tooltip.jsx":"304e125c5c8c","components/forms/Button.jsx":"f63b71869569","components/forms/Input.jsx":"8ec8ad6f65de","components/forms/Select.jsx":"c97e3e57a152","components/navigation/Tabs.jsx":"2e5ecb624fbb","ui_kits/fbl-manager/data.js":"69dc3f1c9cc9"},"inlinedExternals":[],"unexposedExports":[{"name":"ratingTier","sourcePath":"components/data/RatingBadge.jsx"}]} */

(() => {

const __ds_ns = (window.FBLFireballLeagueDesignSystem_5f42ba = window.FBLFireballLeagueDesignSystem_5f42ba || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/data/CapSheet.jsx
try { (() => {
/**
 * FBL CapSheet — salary mass vs cap / luxury tax / aprons as a single gauge.
 * The narrative signature: as payroll climbs it lights up green → yellow →
 * orange → fire red. Being deep in the tax literally burns.
 *
 * props (all in millions):
 *   payroll, cap, taxLine, apron1, apron2
 *   scaleMax?  — right edge of the gauge (defaults just past apron2)
 *   title?
 */
function CapSheet({
  payroll,
  cap,
  taxLine,
  apron1,
  apron2,
  scaleMax,
  title = "Cap Sheet",
  style
}) {
  const max = scaleMax || apron2 * 1.08;
  const pctOf = v => `${Math.max(0, Math.min(100, v / max * 100))}%`;

  // Degrade gracefully when the component is placed in a narrow column:
  // clustered cap/tax/apron labels would otherwise collide.
  const wrapRef = React.useRef(null);
  const [width, setWidth] = React.useState(720);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = width < 420; // hide value strings entirely when very tight

  // Zone the payroll sits in.
  const zone = payroll <= cap ? {
    key: "under",
    color: "var(--fbl-cap-under)",
    label: "Sous le cap"
  } : payroll <= taxLine ? {
    key: "cap",
    color: "var(--fbl-cap-tax)",
    label: "Au-dessus du cap"
  } : payroll <= apron1 ? {
    key: "tax",
    color: "var(--fbl-cap-tax)",
    label: "Luxury tax"
  } : payroll <= apron2 ? {
    key: "apron1",
    color: "var(--fbl-cap-apron1)",
    label: "1er apron"
  } : {
    key: "apron2",
    color: "var(--fbl-cap-apron2)",
    label: "2e apron"
  };
  const overTax = payroll - taxLine;
  const fmt = v => `${v.toFixed(1)}M`;

  // Greedy row assignment: markers whose labels would overlap horizontally are
  // pushed onto a higher row. Collision is driven by clustered cap/tax/apron
  // positions, not container width, so we compare actual pixel positions.
  const trackW = Math.max(width - 44, 120); // minus horizontal padding
  const markerDefs = [{
    key: "cap",
    at: cap,
    label: "CAP",
    short: "CAP",
    value: cap
  }, {
    key: "tax",
    at: taxLine,
    label: "TAX",
    short: "TAX",
    value: taxLine
  }, {
    key: "apron1",
    at: apron1,
    label: "APRON 1",
    short: "A1",
    value: apron1
  }, {
    key: "apron2",
    at: apron2,
    label: "APRON 2",
    short: "A2",
    value: apron2
  }];
  const labelPx = narrow ? 30 : 50; // approx label/value block width + gutter
  const rowLastX = [];
  const markers = markerDefs.map(m => ({
    ...m,
    x: m.at / max * trackW
  })).sort((a, b) => a.x - b.x).map(m => {
    let row = 0;
    while (rowLastX[row] != null && m.x - rowLastX[row] < labelPx) row++;
    rowLastX[row] = m.x;
    return {
      ...m,
      row
    };
  });
  const rowsUsed = rowLastX.length || 1;
  // Block = label line + value line, measured at 30px tall; space rows a full
  // block-height + gap apart so staggered rows can never touch.
  const BLOCK_H = narrow ? 13 : 30;
  const rowStep = BLOCK_H + 8;
  const stackTop = rowStep * rowsUsed + 10;
  const Marker = ({
    m
  }) => {
    // row 0 = nearest the bar; each higher row sits one full rowStep further up
    const top = -(rowStep * (m.row + 1));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        left: pctOf(m.at),
        top: -7,
        bottom: -7,
        width: 2,
        background: "var(--fbl-border-strong)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        top,
        left: "50%",
        transform: "translateX(-50%)",
        textAlign: "center",
        whiteSpace: "nowrap"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--fbl-font-mono)",
        fontSize: 9,
        color: "var(--fbl-text-disabled)",
        letterSpacing: ".08em"
      }
    }, narrow ? m.short : m.label), !narrow && /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--fbl-font-mono)",
        fontSize: 11,
        color: "var(--fbl-text-secondary)",
        fontVariantNumeric: "tabular-nums"
      }
    }, fmt(m.value))));
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: wrapRef,
    style: {
      background: "var(--fbl-surface-1)",
      border: "1px solid var(--fbl-border)",
      borderRadius: "var(--fbl-radius-md)",
      padding: "18px 22px 22px",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: 8,
      gap: 12,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: "var(--fbl-font-display)",
      fontWeight: 400,
      fontSize: 20,
      letterSpacing: ".04em",
      textTransform: "uppercase",
      color: "var(--fbl-text-primary)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-display)",
      fontSize: 28,
      color: zone.color,
      fontVariantNumeric: "tabular-nums",
      lineHeight: 1,
      textShadow: zone.key === "apron1" || zone.key === "apron2" ? "var(--fbl-glow-fire)" : "none"
    }
  }, fmt(payroll)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-body)",
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 999,
      color: zone.color,
      background: "color-mix(in srgb, currentColor 14%, transparent)",
      textTransform: "uppercase",
      letterSpacing: ".06em",
      fontWeight: 600
    }
  }, zone.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      marginTop: stackTop,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      height: 24,
      borderRadius: "var(--fbl-radius-sm)",
      overflow: "hidden",
      background: "var(--fbl-surface-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: pctOf(cap),
      background: "color-mix(in srgb, var(--fbl-cap-under) 32%, transparent)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: `calc(${pctOf(taxLine)} - ${pctOf(cap)})`,
      background: "color-mix(in srgb, var(--fbl-cap-tax) 26%, transparent)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: `calc(${pctOf(apron1)} - ${pctOf(taxLine)})`,
      background: "color-mix(in srgb, var(--fbl-cap-apron1) 26%, transparent)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: "color-mix(in srgb, var(--fbl-cap-apron2) 30%, transparent)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      height: 24,
      width: pctOf(payroll),
      background: zone.color,
      borderRadius: "var(--fbl-radius-sm) 0 0 var(--fbl-radius-sm)",
      transition: "width var(--fbl-dur-slow) var(--fbl-ease-out)",
      boxShadow: zone.key === "apron1" || zone.key === "apron2" ? "var(--fbl-glow-fire)" : "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: -5,
      height: 34,
      width: 3,
      left: pctOf(payroll),
      background: "var(--fbl-text-primary)",
      borderRadius: 2
    }
  }), markers.map(m => /*#__PURE__*/React.createElement(Marker, {
    key: m.key,
    m: m
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 22,
      flexWrap: "wrap",
      marginTop: 26,
      paddingTop: 14,
      borderTop: "1px solid var(--fbl-border)"
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Masse salariale",
    value: fmt(payroll)
  }), /*#__PURE__*/React.createElement(Stat, {
    label: overTax > 0 ? "Dépassement tax" : "Marge sous tax",
    value: fmt(Math.abs(overTax)),
    tone: overTax > 0 ? "var(--fbl-cap-apron1)" : "var(--fbl-cap-under)"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: payroll < cap ? "Espace cap" : "Au-dessus du cap",
    value: fmt(Math.abs(cap - payroll)),
    tone: payroll < cap ? "var(--fbl-cap-under)" : "var(--fbl-text-secondary)"
  })));
}
function Stat({
  label,
  value,
  tone = "var(--fbl-text-primary)"
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-body)",
      fontSize: 11,
      color: "var(--fbl-text-disabled)",
      textTransform: "uppercase",
      letterSpacing: ".06em"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 15,
      color: tone,
      fontVariantNumeric: "tabular-nums",
      fontWeight: 600
    }
  }, value));
}
Object.assign(__ds_scope, { CapSheet });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/CapSheet.jsx", error: String((e && e.message) || e) }); }

// components/data/PlayByPlay.jsx
try { (() => {
/**
 * FBL PlayByPlay — the live-mode textual ticker (possession by possession).
 * The most-consulted mobile screen: big touch rows, running score on the
 * right, event-typed accents. Big plays ("and-one", clutch three, dunk on a
 * run) get the earned fire highlight; routine plays stay flat.
 *
 * events: newest first. Each:
 *   { id, clock, period, team, score, text,
 *     type?: "score"|"three"|"turnover"|"foul"|"block"|"steal"|"timeout"|"sub",
 *     hot?: boolean }
 */
const TYPE_ACCENT = {
  three: "var(--fbl-accent)",
  score: "var(--fbl-text-secondary)",
  block: "var(--fbl-positive)",
  steal: "var(--fbl-positive)",
  turnover: "var(--fbl-negative)",
  foul: "var(--fbl-caution)",
  timeout: "var(--fbl-text-disabled)",
  sub: "var(--fbl-text-disabled)"
};
const TYPE_LABEL = {
  three: "+3",
  score: "+2",
  block: "BLOC",
  steal: "INT",
  turnover: "PB",
  foul: "FAUTE",
  timeout: "TEMPS",
  sub: "CHGT"
};
function PlayByPlay({
  events = [],
  homeAbbr = "HOM",
  awayAbbr = "AWY",
  maxHeight = 420,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--fbl-surface-1)",
      border: "1px solid var(--fbl-border)",
      borderRadius: "var(--fbl-radius-md)",
      overflow: "hidden",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "11px 16px",
      borderBottom: "1px solid var(--fbl-border)",
      background: "var(--fbl-surface-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fbl-live-dot",
    style: {
      width: 7,
      height: 7,
      borderRadius: 999,
      background: "var(--fbl-accent)",
      boxShadow: "0 0 8px var(--fbl-accent)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: ".12em",
      color: "var(--fbl-accent)"
    }
  }, "PLAY-BY-PLAY"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 11,
      color: "var(--fbl-text-disabled)",
      letterSpacing: ".04em"
    }
  }, awayAbbr, " \xB7 ", homeAbbr)), /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch"
    }
  }, events.map(e => {
    const accent = TYPE_ACCENT[e.type] || "var(--fbl-text-secondary)";
    return /*#__PURE__*/React.createElement("div", {
      key: e.id,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 52,
        padding: "10px 16px",
        borderBottom: "1px solid var(--fbl-border)",
        background: e.hot ? "linear-gradient(100deg, rgba(255,201,60,.08), rgba(230,51,18,.03))" : "transparent",
        boxShadow: e.hot ? "inset 3px 0 0 var(--fbl-accent)" : "none"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "none",
        width: 46,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--fbl-font-mono)",
        fontSize: 12,
        color: "var(--fbl-text-primary)",
        fontVariantNumeric: "tabular-nums"
      }
    }, e.clock), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--fbl-font-mono)",
        fontSize: 9,
        color: "var(--fbl-text-disabled)",
        letterSpacing: ".08em"
      }
    }, e.period)), e.type && TYPE_LABEL[e.type] && /*#__PURE__*/React.createElement("span", {
      style: {
        flex: "none",
        minWidth: 34,
        textAlign: "center",
        padding: "3px 6px",
        fontFamily: "var(--fbl-font-mono)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: ".04em",
        borderRadius: "var(--fbl-radius-xs)",
        color: accent,
        background: "color-mix(in srgb, currentColor 14%, transparent)"
      }
    }, TYPE_LABEL[e.type]), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        fontFamily: "var(--fbl-font-body)",
        fontSize: 13.5,
        lineHeight: 1.35,
        color: e.hot ? "var(--fbl-text-primary)" : "var(--fbl-text-secondary)"
      }
    }, e.hot && /*#__PURE__*/React.createElement("span", {
      style: {
        marginRight: 5
      }
    }, "\uD83D\uDD25"), e.text), e.score && /*#__PURE__*/React.createElement("div", {
      style: {
        flex: "none",
        fontFamily: "var(--fbl-font-mono)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--fbl-text-primary)",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: ".02em"
      }
    }, e.score));
  })), /*#__PURE__*/React.createElement("style", null, `
        @keyframes fblPulse{0%,100%{opacity:1}50%{opacity:.35}}
        .fbl-live-dot{animation:fblPulse 1.4s ease-in-out infinite}
        @media(prefers-reduced-motion:reduce){.fbl-live-dot{animation:none}}
      `));
}
Object.assign(__ds_scope, { PlayByPlay });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/PlayByPlay.jsx", error: String((e && e.message) || e) }); }

// components/data/RatingBadge.jsx
try { (() => {
/**
 * Rating tier lookup — the heat ramp. Hotter = better, learnable in 5s.
 * Exported so StatTable / PlayerCard share one source of truth.
 */
function ratingTier(n) {
  if (n >= 88) return {
    key: "elite",
    label: "Élite",
    color: "var(--fbl-tier-elite)",
    soft: "var(--fbl-tier-elite-soft)"
  };
  if (n >= 78) return {
    key: "good",
    label: "Bon",
    color: "var(--fbl-tier-good)",
    soft: "var(--fbl-tier-good-soft)"
  };
  if (n >= 68) return {
    key: "avg",
    label: "Moyen",
    color: "var(--fbl-tier-avg)",
    soft: "var(--fbl-tier-avg-soft)"
  };
  return {
    key: "weak",
    label: "Faible",
    color: "var(--fbl-tier-weak)",
    soft: "var(--fbl-tier-weak-soft)"
  };
}

/**
 * FBL RatingBadge — a reusable 0–99 rating chip colored by heat tier.
 * Élite tier glows (the earned fire signature); lower tiers stay flat.
 * variant: "chip" (soft square) | "solid" | "plain" (number only).
 */
function RatingBadge({
  value,
  size = "md",
  variant = "chip",
  glow = true,
  style
}) {
  const t = ratingTier(value);
  const isElite = t.key === "elite";
  const dims = {
    sm: {
      box: 26,
      fs: 14
    },
    md: {
      box: 34,
      fs: 19
    },
    lg: {
      box: 46,
      fs: 27
    }
  }[size] || {
    box: 34,
    fs: 19
  };
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: dims.box,
    height: dims.box,
    padding: "0 6px",
    fontFamily: "var(--fbl-font-display)",
    fontWeight: 400,
    fontSize: dims.fs,
    lineHeight: 1,
    letterSpacing: ".02em",
    fontVariantNumeric: "tabular-nums",
    borderRadius: "var(--fbl-radius-sm)"
  };
  if (variant === "plain") {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        ...base,
        minWidth: 0,
        height: "auto",
        padding: 0,
        color: t.color,
        textShadow: isElite && glow ? "var(--fbl-glow-flame)" : "none",
        ...style
      }
    }, value);
  }
  if (variant === "solid") {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        ...base,
        background: t.color,
        color: "#0B0B0C",
        fontWeight: 400,
        boxShadow: isElite && glow ? "var(--fbl-glow-flame)" : "none",
        ...style
      }
    }, value);
  }
  return /*#__PURE__*/React.createElement("span", {
    style: {
      ...base,
      background: t.soft,
      color: t.color,
      border: `1px solid ${isElite ? "var(--fbl-tier-elite)" : "transparent"}`,
      boxShadow: isElite && glow ? "0 0 16px rgba(255,201,60,.20)" : "none",
      ...style
    }
  }, value);
}
Object.assign(__ds_scope, { ratingTier, RatingBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/RatingBadge.jsx", error: String((e && e.message) || e) }); }

// components/data/ScoreBanner.jsx
try { (() => {
/**
 * FBL ScoreBanner — compact match strip (scoreboard).
 * Live | Final | Scheduled. The leading team's score is cream, the trailing
 * one dims. A live game shows a pulsing dot + quarter/clock. On a run, pass
 * `home.hot` / `away.hot` to light that score with the earned fire treatment.
 *
 * team shape: { abbr, name?, score?, record?, hot?, logo? }
 */
function ScoreBanner({
  home,
  away,
  state = "final",
  // "live" | "final" | "sched"
  period,
  // e.g. "4TH" or "MI-TEMPS"
  clock,
  // e.g. "02:14"
  tipoff,
  // for scheduled, e.g. "20:30"
  compact = false,
  style
}) {
  const leadHome = (home.score ?? 0) >= (away.score ?? 0);
  const isLive = state === "live";
  const isFinal = state === "final";
  const Team = ({
    t,
    leading,
    align
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: align === "right" ? "flex-end" : "flex-start",
      gap: 2,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexDirection: align === "right" ? "row-reverse" : "row"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-display)",
      fontWeight: 400,
      fontSize: compact ? 18 : 22,
      letterSpacing: ".08em",
      color: "var(--fbl-text-primary)"
    }
  }, t.abbr), t.record && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 11,
      color: "var(--fbl-text-disabled)"
    }
  }, t.record)), t.name && !compact && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-body)",
      fontSize: 11.5,
      color: "var(--fbl-text-secondary)"
    }
  }, t.name));
  const Score = ({
    t,
    leading
  }) => {
    const dim = (isFinal || isLive) && !leading && !t.hot;
    return /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--fbl-font-display)",
        fontWeight: 400,
        fontSize: compact ? 34 : 52,
        lineHeight: 0.82,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: ".01em",
        color: t.hot ? "transparent" : dim ? "var(--fbl-text-secondary)" : "var(--fbl-text-primary)",
        background: t.hot ? "var(--fbl-grad-fire)" : "none",
        WebkitBackgroundClip: t.hot ? "text" : undefined,
        backgroundClip: t.hot ? "text" : undefined,
        textShadow: t.hot ? "0 0 18px rgba(255,107,26,.4)" : "none"
      }
    }, t.score ?? "–");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: compact ? 14 : 22,
      padding: compact ? "12px 16px" : "16px 22px",
      background: "var(--fbl-surface-1)",
      border: "1px solid var(--fbl-border)",
      borderRadius: "var(--fbl-radius-md)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Team, {
    t: away,
    leading: !leadHome,
    align: "left"
  })), /*#__PURE__*/React.createElement(Score, {
    t: away,
    leading: !leadHome
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
      padding: "0 4px",
      minWidth: compact ? 52 : 72
    }
  }, isLive && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fbl-live-dot",
    style: {
      width: 7,
      height: 7,
      borderRadius: 999,
      background: "var(--fbl-accent)",
      boxShadow: "0 0 8px var(--fbl-accent)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: ".12em",
      color: "var(--fbl-accent)"
    }
  }, "LIVE")), isLive && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-display)",
      fontSize: compact ? 18 : 22,
      letterSpacing: ".04em",
      color: "var(--fbl-text-primary)",
      fontVariantNumeric: "tabular-nums"
    }
  }, clock), isLive && period && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 10,
      color: "var(--fbl-text-secondary)",
      letterSpacing: ".1em"
    }
  }, period), isFinal && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-display)",
      fontSize: compact ? 13 : 15,
      letterSpacing: ".16em",
      color: "var(--fbl-flame)"
    }
  }, "FINAL"), state === "sched" && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-display)",
      fontSize: compact ? 16 : 20,
      letterSpacing: ".04em",
      color: "var(--fbl-text-secondary)",
      fontVariantNumeric: "tabular-nums"
    }
  }, tipoff)), /*#__PURE__*/React.createElement(Score, {
    t: home,
    leading: leadHome
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Team, {
    t: home,
    leading: leadHome,
    align: "right"
  })), /*#__PURE__*/React.createElement("style", null, `
        @keyframes fblPulse{0%,100%{opacity:1}50%{opacity:.35}}
        .fbl-live-dot{animation:fblPulse 1.4s ease-in-out infinite}
        @media(prefers-reduced-motion:reduce){.fbl-live-dot{animation:none}}
      `));
}
Object.assign(__ds_scope, { ScoreBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ScoreBanner.jsx", error: String((e && e.message) || e) }); }

// components/data/Standings.jsx
try { (() => {
/**
 * FBL Standings — conference table with playoff / play-in cut lines.
 * Rows 1–6 clinch, 7–10 play-in (dashed line), 11+ out. The user's team
 * row is subtly highlighted. Compact, tabular, tap-scrollable on mobile.
 *
 * teams: [{ rank, abbr, name, w, l, pct, gb, streak, mine? }]  (pre-sorted)
 */
function Standings({
  teams = [],
  conference = "Ouest",
  style
}) {
  const fmtStreak = s => {
    if (!s) return "—";
    const win = s[0] === "W";
    return /*#__PURE__*/React.createElement("span", {
      style: {
        color: win ? "var(--fbl-positive)" : "var(--fbl-negative)"
      }
    }, s);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--fbl-surface-1)",
      border: "1px solid var(--fbl-border)",
      borderRadius: "var(--fbl-radius-md)",
      overflow: "hidden",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 8,
      padding: "12px 16px",
      borderBottom: "1px solid var(--fbl-border)",
      background: "var(--fbl-surface-2)"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: "var(--fbl-font-display)",
      fontWeight: 400,
      fontSize: 19,
      letterSpacing: ".05em",
      textTransform: "uppercase",
      color: "var(--fbl-text-primary)"
    }
  }, "Conf\xE9rence ", conference), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 10,
      color: "var(--fbl-text-disabled)",
      letterSpacing: ".04em"
    }
  }, "\u25CF Playoffs\xA0\xA0\u25D0 Play-in")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto",
      WebkitOverflowScrolling: "touch"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 13,
      fontVariantNumeric: "tabular-nums"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ["#", "Équipe", "V", "D", "%", "GB", "Série"].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      textAlign: i === 1 ? "left" : i === 0 ? "center" : "right",
      padding: "8px 12px",
      position: i <= 1 ? "sticky" : undefined,
      left: i === 0 ? 0 : i === 1 ? 34 : undefined,
      zIndex: i <= 1 ? 2 : 1,
      color: "var(--fbl-text-secondary)",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: ".06em",
      textTransform: "uppercase",
      background: "var(--fbl-surface-2)",
      borderBottom: "1px solid var(--fbl-border-strong)"
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, teams.map((t, ri) => {
    const playoff = t.rank <= 6;
    const playin = t.rank >= 7 && t.rank <= 10;
    const cutBelow = t.rank === 6 || t.rank === 10; // dashed line after
    return /*#__PURE__*/React.createElement("tr", {
      key: t.abbr,
      style: {
        background: t.mine ? "var(--fbl-accent-soft)" : ri % 2 ? "rgba(255,255,255,.018)" : "transparent",
        borderBottom: cutBelow ? "1px dashed var(--fbl-border-strong)" : "1px solid var(--fbl-border)"
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: "center",
        padding: "9px 12px",
        position: "sticky",
        left: 0,
        zIndex: 1,
        background: t.mine ? "#2A2113" : ri % 2 ? "#161D30" : "var(--fbl-surface-1)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: 999,
        background: playoff ? "var(--fbl-positive)" : playin ? "var(--fbl-caution)" : "transparent",
        border: playoff || playin ? "none" : "1px solid var(--fbl-border-strong)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fbl-text-secondary)"
      }
    }, t.rank))), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: "left",
        padding: "9px 12px",
        position: "sticky",
        left: 34,
        zIndex: 1,
        background: t.mine ? "#2A2113" : ri % 2 ? "#161D30" : "var(--fbl-surface-1)",
        whiteSpace: "nowrap"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--fbl-font-display)",
        fontSize: 15,
        letterSpacing: ".05em",
        color: "var(--fbl-text-primary)",
        marginRight: 8
      }
    }, t.abbr), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--fbl-font-body)",
        fontSize: 12,
        color: "var(--fbl-text-secondary)"
      }
    }, t.name)), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: "right",
        padding: "9px 12px",
        color: "var(--fbl-text-primary)",
        borderBottom: "inherit"
      }
    }, t.w), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: "right",
        padding: "9px 12px",
        color: "var(--fbl-text-secondary)"
      }
    }, t.l), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: "right",
        padding: "9px 12px",
        color: "var(--fbl-text-primary)"
      }
    }, t.pct), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: "right",
        padding: "9px 12px",
        color: "var(--fbl-text-secondary)"
      }
    }, t.gb), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: "right",
        padding: "9px 12px"
      }
    }, fmtStreak(t.streak)));
  })))));
}
Object.assign(__ds_scope, { Standings });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Standings.jsx", error: String((e && e.message) || e) }); }

// components/data/StatTable.jsx
try { (() => {
/**
 * FBL StatTable — dense, sortable data table.
 * - Tabular mono figures, compact rows, subtle zebra.
 * - First column frozen (sticky) so player names stay put on horizontal scroll.
 * - Sort by tapping a header (touch-friendly, not hover-only).
 * - Mobile strategy: priority columns stay; the rest scroll horizontally
 *   inside the component's own scroller (page never scrolls sideways).
 *
 * columns: [{ key, label, align?, width?, numeric?, tooltip?, render?(row), priority? }]
 */
function StatTable({
  columns = [],
  rows = [],
  rowKey = "id",
  defaultSort = null,
  dense = false,
  hotKey = null,
  // optional: row[hotKey] truthy → earned "on fire" row accent
  onRowClick,
  style
}) {
  const [sort, setSort] = React.useState(defaultSort); // { key, dir }

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const {
      key,
      dir
    } = sort;
    const f = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[key],
        bv = b[key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * f;
      return String(av).localeCompare(String(bv)) * f;
    });
  }, [rows, sort]);
  const toggleSort = key => setSort(s => s?.key === key ? {
    key,
    dir: s.dir === "asc" ? "desc" : "asc"
  } : {
    key,
    dir: "desc"
  });
  const cellPad = dense ? "6px 10px" : "9px 12px";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--fbl-border)",
      borderRadius: "var(--fbl-radius-md)",
      background: "var(--fbl-surface-1)",
      overflow: "hidden",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto",
      WebkitOverflowScrolling: "touch"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontFamily: "var(--fbl-font-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: dense ? 12.5 : 13
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map((c, i) => {
    const active = sort?.key === c.key;
    const frozen = i === 0;
    return /*#__PURE__*/React.createElement("th", {
      key: c.key,
      onClick: () => toggleSort(c.key),
      title: c.tooltip,
      style: {
        position: frozen ? "sticky" : undefined,
        left: frozen ? 0 : undefined,
        zIndex: frozen ? 2 : 1,
        textAlign: c.align || (c.numeric ? "right" : "left"),
        padding: cellPad,
        minHeight: 44,
        whiteSpace: "nowrap",
        cursor: "pointer",
        userSelect: "none",
        color: active ? "var(--fbl-accent)" : "var(--fbl-text-secondary)",
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        background: "var(--fbl-surface-2)",
        borderBottom: "1px solid var(--fbl-border-strong)",
        width: c.width
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        justifyContent: c.numeric ? "flex-end" : "flex-start"
      }
    }, c.label, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        opacity: active ? 1 : 0.35
      }
    }, active ? sort.dir === "asc" ? "▲" : "▼" : "▾")));
  }))), /*#__PURE__*/React.createElement("tbody", null, sorted.map((row, ri) => {
    const hot = hotKey && row[hotKey];
    return /*#__PURE__*/React.createElement("tr", {
      key: row[rowKey] ?? ri,
      onClick: onRowClick ? () => onRowClick(row) : undefined,
      style: {
        background: ri % 2 ? "rgba(255,255,255,.018)" : "transparent",
        cursor: onRowClick ? "pointer" : "default",
        boxShadow: hot ? "inset 3px 0 0 var(--fbl-accent)" : "none"
      }
    }, columns.map((c, ci) => {
      const frozen = ci === 0;
      const content = c.render ? c.render(row) : row[c.key];
      return /*#__PURE__*/React.createElement("td", {
        key: c.key,
        style: {
          position: frozen ? "sticky" : undefined,
          left: frozen ? 0 : undefined,
          zIndex: frozen ? 1 : 0,
          textAlign: c.align || (c.numeric ? "right" : "left"),
          padding: cellPad,
          whiteSpace: "nowrap",
          color: frozen ? "var(--fbl-text-primary)" : "var(--fbl-text-secondary)",
          fontFamily: frozen && !c.numeric ? "var(--fbl-font-body)" : "var(--fbl-font-mono)",
          fontWeight: frozen && !c.numeric ? 500 : 400,
          borderBottom: "1px solid var(--fbl-border)",
          background: frozen ? ri % 2 ? "#161D30" : "var(--fbl-surface-1)" : undefined
        }
      }, content);
    }));
  })))));
}
Object.assign(__ds_scope, { StatTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatTable.jsx", error: String((e && e.message) || e) }); }

// components/data/BoxScore.jsx
try { (() => {
/**
 * FBL BoxScore — extended match view: scoreboard + per-quarter line +
 * a team's box score table. Tab between the two teams' box scores.
 *
 * props:
 *   home, away        — ScoreTeam-ish { abbr, name?, score, record? }
 *   state, period, clock
 *   lineScore         — { away:[q1..], home:[q1..] }
 *   boxHome, boxAway  — [{ name, pos, min, pts, reb, ast, fg, tp, pm, hot? }]
 */
function BoxScore({
  home,
  away,
  state = "final",
  period,
  clock,
  lineScore,
  boxHome = [],
  boxAway = [],
  style
}) {
  const [side, setSide] = React.useState("home");
  const rows = side === "home" ? boxHome : boxAway;
  const team = side === "home" ? home : away;
  const columns = [{
    key: "name",
    label: "Joueur",
    render: r => /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }
    }, r.name, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fbl-text-disabled)",
        fontSize: 10,
        fontFamily: "var(--fbl-font-mono)"
      }
    }, r.pos), r.hot && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11
      }
    }, "\uD83D\uDD25"))
  }, {
    key: "min",
    label: "MIN",
    numeric: true
  }, {
    key: "pts",
    label: "PTS",
    numeric: true,
    render: r => /*#__PURE__*/React.createElement("span", {
      style: {
        color: r.hot ? "var(--fbl-flame)" : "var(--fbl-text-primary)",
        fontWeight: r.hot ? 700 : 400,
        textShadow: r.hot ? "var(--fbl-glow-flame)" : "none"
      }
    }, r.pts)
  }, {
    key: "reb",
    label: "REB",
    numeric: true
  }, {
    key: "ast",
    label: "AST",
    numeric: true
  }, {
    key: "fg",
    label: "FG",
    numeric: true
  }, {
    key: "tp",
    label: "3P",
    numeric: true
  }, {
    key: "pm",
    label: "+/−",
    numeric: true,
    render: r => /*#__PURE__*/React.createElement("span", {
      style: {
        color: r.pm > 0 ? "var(--fbl-positive)" : r.pm < 0 ? "var(--fbl-negative)" : "var(--fbl-text-secondary)"
      }
    }, r.pm > 0 ? `+${r.pm}` : r.pm)
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12,
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.ScoreBanner, {
    home: home,
    away: away,
    state: state,
    period: period,
    clock: clock
  }), lineScore && /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto",
      border: "1px solid var(--fbl-border)",
      borderRadius: "var(--fbl-radius-md)",
      background: "var(--fbl-surface-1)"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 12.5,
      fontVariantNumeric: "tabular-nums"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: thStyle("left")
  }), lineScore.away.map((_, i) => /*#__PURE__*/React.createElement("th", {
    key: i,
    style: thStyle("right")
  }, "Q", i + 1)), /*#__PURE__*/React.createElement("th", {
    style: {
      ...thStyle("right"),
      color: "var(--fbl-flame)"
    }
  }, "T"))), /*#__PURE__*/React.createElement("tbody", null, [["away", away, lineScore.away], ["home", home, lineScore.home]].map(([k, t, line]) => /*#__PURE__*/React.createElement("tr", {
    key: k
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      ...tdStyle("left"),
      fontFamily: "var(--fbl-font-display)",
      fontSize: 16,
      letterSpacing: ".06em",
      color: "var(--fbl-text-primary)"
    }
  }, t.abbr), line.map((q, i) => /*#__PURE__*/React.createElement("td", {
    key: i,
    style: tdStyle("right")
  }, q)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...tdStyle("right"),
      color: "var(--fbl-text-primary)",
      fontWeight: 600
    }
  }, t.score)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 3,
      padding: 3,
      background: "var(--fbl-surface-1)",
      border: "1px solid var(--fbl-border)",
      borderRadius: "var(--fbl-radius-sm)",
      width: "fit-content"
    }
  }, [["away", away.abbr], ["home", home.abbr]].map(([k, abbr]) => {
    const on = side === k;
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setSide(k),
      style: {
        minHeight: 34,
        padding: "0 16px",
        border: "none",
        borderRadius: "var(--fbl-radius-xs)",
        cursor: "pointer",
        fontFamily: "var(--fbl-font-display)",
        fontSize: 16,
        letterSpacing: ".06em",
        color: on ? "var(--fbl-text-on-accent)" : "var(--fbl-text-secondary)",
        background: on ? "var(--fbl-accent)" : "transparent"
      }
    }, abbr);
  })), /*#__PURE__*/React.createElement(__ds_scope.StatTable, {
    columns: columns,
    rows: rows,
    rowKey: "name",
    dense: true,
    defaultSort: {
      key: "pts",
      dir: "desc"
    }
  }));
}
const thStyle = align => ({
  textAlign: align,
  padding: "8px 12px",
  color: "var(--fbl-text-secondary)",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  borderBottom: "1px solid var(--fbl-border-strong)",
  background: "var(--fbl-surface-2)"
});
const tdStyle = align => ({
  textAlign: align,
  padding: "7px 12px",
  color: "var(--fbl-text-secondary)",
  borderBottom: "1px solid var(--fbl-border)"
});
Object.assign(__ds_scope, { BoxScore });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/BoxScore.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FBL Badge / Pill — positions (PG–C), injury & contract statuses, generic tags.
 * `tone` picks the semantic color; `variant` soft (tinted) or solid.
 * Injury statuses always render a cross so they never read as a plain "loss".
 */
const TONES = {
  neutral: {
    fg: "var(--fbl-text-secondary)",
    soft: "var(--fbl-neutral-soft)",
    solid: "var(--fbl-surface-3)"
  },
  accent: {
    fg: "var(--fbl-accent)",
    soft: "var(--fbl-accent-soft)",
    solid: "var(--fbl-accent)"
  },
  positive: {
    fg: "var(--fbl-positive)",
    soft: "var(--fbl-positive-soft)",
    solid: "var(--fbl-positive)"
  },
  negative: {
    fg: "var(--fbl-negative)",
    soft: "var(--fbl-negative-soft)",
    solid: "var(--fbl-negative)"
  },
  caution: {
    fg: "var(--fbl-caution)",
    soft: "var(--fbl-caution-soft)",
    solid: "var(--fbl-caution)"
  },
  injury: {
    fg: "var(--fbl-injury)",
    soft: "var(--fbl-injury-soft)",
    solid: "var(--fbl-injury)"
  }
};
function Badge({
  children,
  tone = "neutral",
  variant = "soft",
  size = "md",
  icon = null,
  uppercase = true,
  style,
  ...rest
}) {
  const t = TONES[tone] || TONES.neutral;
  const solid = variant === "solid";
  const pad = size === "sm" ? "2px 7px" : "4px 10px";
  const fs = size === "sm" ? 10 : 11;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: pad,
      fontFamily: "var(--fbl-font-mono)",
      fontSize: fs,
      fontWeight: 600,
      lineHeight: 1,
      letterSpacing: ".05em",
      textTransform: uppercase ? "uppercase" : "none",
      borderRadius: "var(--fbl-radius-pill)",
      whiteSpace: "nowrap",
      color: solid ? tone === "caution" || tone === "accent" ? "var(--fbl-text-on-accent)" : "#0B0B0C" : t.fg,
      background: solid ? t.solid : t.soft,
      border: solid ? "none" : `1px solid transparent`,
      ...style
    }
  }, rest), icon, children);
}

/** Position badge (PG/SG/SF/PF/C) — subtle neutral chip. */
function PositionBadge({
  pos,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(Badge, _extends({
    tone: "neutral",
    size: "sm",
    style: style
  }, rest), pos);
}

/** Injury status badge — always renders a cross glyph. status: OUT | DTD | GTD | OK */
function InjuryBadge({
  status = "OUT",
  style,
  ...rest
}) {
  const map = {
    OUT: {
      tone: "injury",
      label: "OUT",
      cross: true
    },
    DTD: {
      tone: "caution",
      label: "DTD",
      cross: true
    },
    GTD: {
      tone: "caution",
      label: "GTD",
      cross: true
    },
    OK: {
      tone: "positive",
      label: "APTE",
      cross: false
    }
  };
  const m = map[status] || map.OUT;
  return /*#__PURE__*/React.createElement(Badge, _extends({
    tone: m.tone,
    size: "sm",
    icon: m.cross ? /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true"
    }, "\u271A") : null,
    style: style
  }, rest), m.label);
}
Object.assign(__ds_scope, { Badge, PositionBadge, InjuryBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data/PlayerCard.jsx
try { (() => {
/**
 * FBL PlayerCard — identity header + 0–99 attributes visualised by heat tier
 * + mental traits as badges. Responsive: attribute grid reflows 1→2 columns.
 *
 * player: {
 *   name, pos, age, team, number, ovr,
 *   contract: "34.2M · 3 ans", status: "OUT"|"DTD"|"OK",
 *   attributes: [{ label, value }],
 *   traits: [string],
 *   onFire?: boolean
 * }
 */
function PlayerCard({
  player,
  style
}) {
  const {
    name,
    pos,
    age,
    team,
    number,
    ovr,
    contract,
    status = "OK",
    attributes = [],
    traits = [],
    onFire = false
  } = player;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--fbl-surface-1)",
      border: "1px solid var(--fbl-border)",
      borderRadius: "var(--fbl-radius-lg)",
      overflow: "hidden",
      maxWidth: 420,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "18px 20px",
      background: onFire ? "linear-gradient(100deg, rgba(255,201,60,.10), rgba(230,51,18,.05))" : "var(--fbl-surface-2)",
      borderBottom: "1px solid var(--fbl-border)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.RatingBadge, {
    value: ovr,
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: "var(--fbl-font-display)",
      fontWeight: 400,
      fontSize: 26,
      letterSpacing: ".02em",
      textTransform: "uppercase",
      color: "var(--fbl-text-primary)",
      lineHeight: 1
    }
  }, name), onFire && /*#__PURE__*/React.createElement("span", {
    title: "En feu",
    style: {
      fontSize: 14,
      filter: "drop-shadow(0 0 6px rgba(255,107,26,.7))"
    }
  }, "\uD83D\uDD25")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 7,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.PositionBadge, {
    pos: pos
  }), number != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 12,
      color: "var(--fbl-text-disabled)"
    }
  }, "#", number), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-body)",
      fontSize: 12.5,
      color: "var(--fbl-text-secondary)"
    }
  }, age, " ans", team ? ` · ${team}` : ""), status !== "OK" && /*#__PURE__*/React.createElement(__ds_scope.InjuryBadge, {
    status: status
  })))), contract && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 20px",
      borderBottom: "1px solid var(--fbl-border)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-body)",
      fontSize: 12,
      color: "var(--fbl-text-secondary)",
      textTransform: "uppercase",
      letterSpacing: ".06em"
    }
  }, "Contrat"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 13,
      color: "var(--fbl-text-primary)",
      fontVariantNumeric: "tabular-nums"
    }
  }, contract)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: "10px 22px"
    }
  }, attributes.map(a => {
    const t = __ds_scope.ratingTier(a.value);
    return /*#__PURE__*/React.createElement("div", {
      key: a.label,
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 5
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--fbl-font-body)",
        fontSize: 12.5,
        color: "var(--fbl-text-secondary)"
      }
    }, a.label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--fbl-font-mono)",
        fontSize: 13,
        fontWeight: 600,
        color: t.color,
        fontVariantNumeric: "tabular-nums"
      }
    }, a.value)), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 4,
        background: "var(--fbl-surface-3)",
        borderRadius: 999,
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: `${a.value}%`,
        height: "100%",
        background: t.color,
        borderRadius: 999
      }
    })));
  })), traits.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--fbl-font-body)",
      fontSize: 11,
      color: "var(--fbl-text-disabled)",
      textTransform: "uppercase",
      letterSpacing: ".08em",
      marginBottom: 9
    }
  }, "Traits mentaux"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      flexWrap: "wrap"
    }
  }, traits.map(tr => /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    key: tr,
    tone: "neutral",
    uppercase: false
  }, tr))))));
}
Object.assign(__ds_scope, { PlayerCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/PlayerCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
/**
 * FBL Modal — centered dialog on a dark scrim. Esc + backdrop close,
 * focus trapped to the panel. Mobile: slides up as a bottom sheet.
 */
function Modal({
  open,
  onClose,
  title,
  children,
  footer = null,
  width = 460,
  danger = false
}) {
  const panelRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    onMouseDown: e => {
      if (e.target === e.currentTarget) onClose?.();
    },
    style: {
      position: "fixed",
      inset: 0,
      zIndex: "var(--fbl-z-modal)",
      background: "var(--fbl-overlay)",
      backdropFilter: "blur(3px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      animation: "fblScrim var(--fbl-dur-base) var(--fbl-ease-out)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: panelRef,
    tabIndex: -1,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": title,
    style: {
      width: "100%",
      maxWidth: width,
      maxHeight: "88vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--fbl-surface-2)",
      border: "1px solid var(--fbl-border-strong)",
      borderTop: danger ? "2px solid var(--fbl-danger)" : "2px solid var(--fbl-accent)",
      borderRadius: "var(--fbl-radius-lg)",
      boxShadow: "var(--fbl-elev-modal)",
      outline: "none",
      animation: "fblRise var(--fbl-dur-base) var(--fbl-ease-out)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "18px 22px",
      borderBottom: "1px solid var(--fbl-border)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: "var(--fbl-font-display)",
      fontWeight: 400,
      fontSize: 22,
      letterSpacing: ".03em",
      textTransform: "uppercase",
      color: "var(--fbl-text-primary)"
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Fermer",
    style: {
      width: 34,
      height: 34,
      flex: "none",
      display: "grid",
      placeItems: "center",
      background: "transparent",
      border: "none",
      color: "var(--fbl-text-secondary)",
      cursor: "pointer",
      borderRadius: "var(--fbl-radius-sm)",
      fontSize: 18,
      lineHeight: 1
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "20px 22px",
      overflowY: "auto",
      color: "var(--fbl-text-secondary)",
      fontFamily: "var(--fbl-font-body)",
      fontSize: 14,
      lineHeight: 1.55
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 10,
      padding: "14px 22px",
      borderTop: "1px solid var(--fbl-border)"
    }
  }, footer)), /*#__PURE__*/React.createElement("style", null, `
        @keyframes fblScrim{from{opacity:0}to{opacity:1}}
        @keyframes fblRise{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
      `));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Modal.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressBar.jsx
try { (() => {
/**
 * FBL ProgressBar — generic determinate bar (fatigue, XP, contract used,
 * shot clock). `tone` picks the fill; supports a target marker and label.
 * For a full cap/tax gauge use <CapSheet>, not this.
 */
const FILL = {
  accent: "var(--fbl-accent)",
  positive: "var(--fbl-positive)",
  caution: "var(--fbl-caution)",
  negative: "var(--fbl-negative)",
  fire: "var(--fbl-grad-fire)"
};
function ProgressBar({
  value = 0,
  max = 100,
  tone = "accent",
  size = "md",
  label,
  showValue = false,
  markerAt = null,
  style
}) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  const h = size === "sm" ? 6 : size === "lg" ? 14 : 9;
  const fill = FILL[tone] || FILL.accent;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      ...style
    }
  }, (label || showValue) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline"
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-body)",
      fontSize: 12,
      color: "var(--fbl-text-secondary)"
    }
  }, label), showValue && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--fbl-font-mono)",
      fontSize: 12,
      color: "var(--fbl-text-primary)",
      fontVariantNumeric: "tabular-nums"
    }
  }, Math.round(pct), "%")), /*#__PURE__*/React.createElement("div", {
    role: "progressbar",
    "aria-valuenow": value,
    "aria-valuemin": 0,
    "aria-valuemax": max,
    style: {
      position: "relative",
      height: h,
      background: "var(--fbl-surface-3)",
      borderRadius: "var(--fbl-radius-pill)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: "100%",
      background: fill,
      borderRadius: "var(--fbl-radius-pill)",
      transition: "width var(--fbl-dur-slow) var(--fbl-ease-out)"
    }
  }), markerAt != null && /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      top: -2,
      bottom: -2,
      left: `${Math.min(100, Math.max(0, markerAt))}%`,
      width: 2,
      background: "var(--fbl-text-primary)",
      opacity: 0.75
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
/**
 * FBL Toast — transient notification (trade accepted, injury, cap alert).
 * `tone` drives the left accent bar; auto-dismisses after `duration` ms.
 */
const TONE_COLOR = {
  info: "var(--fbl-accent)",
  positive: "var(--fbl-positive)",
  negative: "var(--fbl-negative)",
  caution: "var(--fbl-caution)"
};
function Toast({
  tone = "info",
  title,
  message,
  icon = null,
  onClose,
  duration = 5000,
  style
}) {
  React.useEffect(() => {
    if (!duration) return;
    const t = setTimeout(() => onClose?.(), duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);
  const bar = TONE_COLOR[tone] || TONE_COLOR.info;
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      width: "min(360px, calc(100vw - 32px))",
      padding: "13px 14px 13px 16px",
      background: "var(--fbl-surface-2)",
      borderRadius: "var(--fbl-radius-md)",
      borderLeft: `3px solid ${bar}`,
      boxShadow: "var(--fbl-elev-3)",
      animation: "fblToastIn var(--fbl-dur-base) var(--fbl-ease-out)",
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: bar,
      fontSize: 16,
      lineHeight: 1.2,
      marginTop: 1
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--fbl-font-body)",
      fontWeight: 600,
      fontSize: 13.5,
      color: "var(--fbl-text-primary)"
    }
  }, title), message && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--fbl-font-body)",
      fontSize: 12.5,
      color: "var(--fbl-text-secondary)",
      marginTop: title ? 2 : 0,
      lineHeight: 1.45
    }
  }, message)), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Fermer",
    style: {
      flex: "none",
      width: 22,
      height: 22,
      marginTop: -1,
      display: "grid",
      placeItems: "center",
      background: "transparent",
      border: "none",
      color: "var(--fbl-text-disabled)",
      cursor: "pointer",
      fontSize: 13
    }
  }, "\u2715"), /*#__PURE__*/React.createElement("style", null, `@keyframes fblToastIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}`));
}

/** Fixed bottom-right stack container for toasts. */
function ToastStack({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      right: 16,
      bottom: 16,
      zIndex: "var(--fbl-z-toast)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Toast, ToastStack });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
/**
 * FBL Tooltip — works on hover AND tap (touch-friendly, no hover-only data).
 * Wraps a trigger; shows `content` on focus/hover/tap.
 */
function Tooltip({
  content,
  children,
  placement = "top",
  style
}) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef(null);
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    timer.current = setTimeout(() => setOpen(false), 60);
  };
  const toggle = () => setOpen(o => !o);
  const pos = {
    top: {
      bottom: "calc(100% + 8px)",
      left: "50%",
      transform: "translateX(-50%)"
    },
    bottom: {
      top: "calc(100% + 8px)",
      left: "50%",
      transform: "translateX(-50%)"
    },
    left: {
      right: "calc(100% + 8px)",
      top: "50%",
      transform: "translateY(-50%)"
    },
    right: {
      left: "calc(100% + 8px)",
      top: "50%",
      transform: "translateY(-50%)"
    }
  }[placement];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      display: "inline-flex",
      ...style
    },
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide
  }, /*#__PURE__*/React.createElement("span", {
    tabIndex: 0,
    role: "button",
    "aria-label": typeof content === "string" ? content : undefined,
    onClick: toggle,
    style: {
      display: "inline-flex",
      cursor: "help"
    }
  }, children), open && /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    style: {
      position: "absolute",
      ...pos,
      zIndex: "var(--fbl-z-tooltip)",
      maxWidth: 240,
      width: "max-content",
      padding: "7px 10px",
      background: "var(--fbl-surface-2)",
      color: "var(--fbl-text-primary)",
      border: "1px solid var(--fbl-border-strong)",
      borderRadius: "var(--fbl-radius-sm)",
      boxShadow: "var(--fbl-elev-3)",
      fontFamily: "var(--fbl-font-body)",
      fontSize: 12.5,
      lineHeight: 1.4,
      pointerEvents: "none",
      animation: "fblFade var(--fbl-dur-fast) var(--fbl-ease-out)"
    }
  }, content), /*#__PURE__*/React.createElement("style", null, `@keyframes fblFade{from{opacity:0;transform:translateY(2px) ${pos.transform || ""}}to{opacity:1}}`));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FBL Button — primary / secondary / danger / ghost, three sizes.
 * Fire accent is reserved for interaction, so the primary variant IS the
 * one place orange fills appear in normal UI.
 */
function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  block = false,
  iconLeft = null,
  iconRight = null,
  type = "button",
  onClick,
  style,
  children,
  ...rest
}) {
  const sizes = {
    sm: {
      h: 32,
      px: 12,
      fs: 13,
      gap: 6
    },
    md: {
      h: 40,
      px: 16,
      fs: 14,
      gap: 8
    },
    lg: {
      h: 48,
      px: 22,
      fs: 16,
      gap: 8
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: "var(--fbl-accent)",
      color: "var(--fbl-text-on-accent)",
      border: "1px solid transparent",
      fontWeight: 600
    },
    secondary: {
      background: "var(--fbl-surface-2)",
      color: "var(--fbl-text-primary)",
      border: "1px solid var(--fbl-border-strong)",
      fontWeight: 500
    },
    danger: {
      background: "transparent",
      color: "var(--fbl-danger)",
      border: "1px solid var(--fbl-danger)",
      fontWeight: 600
    },
    ghost: {
      background: "transparent",
      color: "var(--fbl-text-secondary)",
      border: "1px solid transparent",
      fontWeight: 500
    }
  };
  const v = variants[variant] || variants.primary;
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const hoverBg = {
    primary: hover ? "var(--fbl-accent-hover)" : v.background,
    secondary: hover ? "var(--fbl-surface-3)" : v.background,
    danger: hover ? "var(--fbl-danger-soft)" : v.background,
    ghost: hover ? "var(--fbl-neutral-soft)" : v.background
  }[variant];
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    style: {
      display: block ? "flex" : "inline-flex",
      width: block ? "100%" : undefined,
      alignItems: "center",
      justifyContent: "center",
      gap: s.gap,
      minHeight: s.h,
      height: s.h,
      padding: `0 ${s.px}px`,
      fontFamily: "var(--fbl-font-body)",
      fontSize: s.fs,
      fontWeight: v.fontWeight,
      lineHeight: 1,
      letterSpacing: ".01em",
      borderRadius: "var(--fbl-radius-sm)",
      cursor: disabled ? "not-allowed" : "pointer",
      userSelect: "none",
      whiteSpace: "nowrap",
      transition: "background var(--fbl-dur-fast) var(--fbl-ease-out), transform var(--fbl-dur-instant) var(--fbl-ease-out), border-color var(--fbl-dur-fast)",
      transform: active && !disabled ? "translateY(1px)" : "none",
      opacity: disabled ? 0.4 : 1,
      ...v,
      background: disabled ? v.background : hoverBg,
      ...style
    }
  }, rest), iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FBL Input — text/number field for a dark, data-dense UI.
 * Numeric inputs use the mono face so digits align.
 */
function Input({
  label,
  hint,
  error,
  numeric = false,
  prefix = null,
  suffix = null,
  size = "md",
  disabled = false,
  id,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const uid = id || React.useId();
  const h = size === "sm" ? 34 : size === "lg" ? 48 : 40;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: uid,
    style: {
      fontFamily: "var(--fbl-font-body)",
      fontSize: 12,
      fontWeight: 500,
      color: "var(--fbl-text-secondary)",
      letterSpacing: ".01em"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: h,
      padding: "0 12px",
      background: "var(--fbl-surface-1)",
      border: `1px solid ${error ? "var(--fbl-danger)" : focus ? "var(--fbl-accent)" : "var(--fbl-border-strong)"}`,
      borderRadius: "var(--fbl-radius-sm)",
      boxShadow: focus && !error ? "0 0 0 3px var(--fbl-accent-soft)" : "none",
      transition: "border-color var(--fbl-dur-fast), box-shadow var(--fbl-dur-fast)",
      opacity: disabled ? 0.45 : 1
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--fbl-text-disabled)",
      fontSize: 13,
      fontFamily: "var(--fbl-font-mono)"
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    id: uid,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      width: "100%",
      minWidth: 0,
      background: "transparent",
      border: "none",
      outline: "none",
      color: "var(--fbl-text-primary)",
      fontFamily: numeric ? "var(--fbl-font-mono)" : "var(--fbl-font-body)",
      fontVariantNumeric: numeric ? "tabular-nums" : "normal",
      fontSize: numeric ? 14 : 14,
      letterSpacing: numeric ? ".02em" : "0"
    }
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--fbl-text-disabled)",
      fontSize: 13,
      fontFamily: "var(--fbl-font-mono)"
    }
  }, suffix)), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: error ? "var(--fbl-danger)" : "var(--fbl-text-disabled)",
      fontFamily: "var(--fbl-font-body)"
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FBL Select — styled native <select> (accessible, touch-friendly).
 */
function Select({
  label,
  hint,
  options = [],
  value,
  onChange,
  size = "md",
  disabled = false,
  id,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const uid = id || React.useId();
  const h = size === "sm" ? 34 : size === "lg" ? 48 : 40;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: uid,
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: "var(--fbl-text-secondary)",
      fontFamily: "var(--fbl-font-body)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: uid,
    value: value,
    disabled: disabled,
    onChange: onChange,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      appearance: "none",
      WebkitAppearance: "none",
      width: "100%",
      height: h,
      padding: "0 34px 0 12px",
      background: "var(--fbl-surface-1)",
      color: "var(--fbl-text-primary)",
      border: `1px solid ${focus ? "var(--fbl-accent)" : "var(--fbl-border-strong)"}`,
      borderRadius: "var(--fbl-radius-sm)",
      boxShadow: focus ? "0 0 0 3px var(--fbl-accent-soft)" : "none",
      fontFamily: "var(--fbl-font-body)",
      fontSize: 14,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transition: "border-color var(--fbl-dur-fast), box-shadow var(--fbl-dur-fast)"
    }
  }, rest), options.map(o => {
    const opt = typeof o === "string" ? {
      value: o,
      label: o
    } : o;
    return /*#__PURE__*/React.createElement("option", {
      key: opt.value,
      value: opt.value,
      style: {
        background: "var(--fbl-surface-2)"
      }
    }, opt.label);
  })), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      right: 12,
      top: "50%",
      transform: "translateY(-50%)",
      pointerEvents: "none",
      color: "var(--fbl-text-secondary)",
      fontSize: 11
    }
  }, "\u25BC")), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: "var(--fbl-text-disabled)",
      fontFamily: "var(--fbl-font-body)"
    }
  }, hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/**
 * FBL Tabs — segmented navigation for switching data views
 * (Roster / Stats / Contrats / …). Touch targets ≥ 44px in "line" default.
 * variant: "line" (underline) | "segmented" (pill group).
 */
function Tabs({
  tabs = [],
  value,
  onChange,
  variant = "line",
  style
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = React.useState(tabs[0]?.value);
  const active = controlled ? value : internal;
  const select = v => {
    if (!controlled) setInternal(v);
    onChange?.(v);
  };
  if (variant === "segmented") {
    return /*#__PURE__*/React.createElement("div", {
      role: "tablist",
      style: {
        display: "inline-flex",
        padding: 3,
        gap: 3,
        background: "var(--fbl-surface-1)",
        border: "1px solid var(--fbl-border)",
        borderRadius: "var(--fbl-radius-sm)",
        ...style
      }
    }, tabs.map(t => {
      const on = t.value === active;
      return /*#__PURE__*/React.createElement("button", {
        key: t.value,
        role: "tab",
        "aria-selected": on,
        onClick: () => select(t.value),
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minHeight: 34,
          padding: "0 14px",
          border: "none",
          borderRadius: "var(--fbl-radius-xs)",
          cursor: "pointer",
          fontFamily: "var(--fbl-font-body)",
          fontSize: 13,
          fontWeight: on ? 600 : 500,
          color: on ? "var(--fbl-text-on-accent)" : "var(--fbl-text-secondary)",
          background: on ? "var(--fbl-accent)" : "transparent",
          transition: "background var(--fbl-dur-fast), color var(--fbl-dur-fast)"
        }
      }, t.label, t.count != null && /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: "var(--fbl-font-mono)",
          fontSize: 11,
          opacity: on ? 0.8 : 0.7
        }
      }, t.count));
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: "flex",
      gap: 4,
      borderBottom: "1px solid var(--fbl-border)",
      overflowX: "auto",
      ...style
    }
  }, tabs.map(t => {
    const on = t.value === active;
    return /*#__PURE__*/React.createElement("button", {
      key: t.value,
      role: "tab",
      "aria-selected": on,
      onClick: () => select(t.value),
      style: {
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        minHeight: 44,
        padding: "0 14px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontFamily: "var(--fbl-font-body)",
        fontSize: 14,
        fontWeight: on ? 600 : 500,
        color: on ? "var(--fbl-text-primary)" : "var(--fbl-text-secondary)",
        boxShadow: on ? "inset 0 -2px 0 var(--fbl-accent)" : "inset 0 -2px 0 transparent",
        transition: "color var(--fbl-dur-fast), box-shadow var(--fbl-dur-fast)"
      }
    }, t.label, t.count != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--fbl-font-mono)",
        fontSize: 11,
        padding: "1px 6px",
        borderRadius: "var(--fbl-radius-pill)",
        background: on ? "var(--fbl-accent-soft)" : "var(--fbl-neutral-soft)",
        color: on ? "var(--fbl-accent)" : "var(--fbl-text-disabled)"
      }
    }, t.count));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/fbl-manager/data.js
try { (() => {
/* Fake but realistic FBL data — fully procedural/anonymised, no real names. */
window.FBL_DATA = {
  team: {
    abbr: "BLZ",
    name: "Blaze",
    city: "Ashford",
    conf: "Ouest",
    div: "Pacifique",
    record: "41-22",
    streak: "W5",
    seed: 1
  },
  roster: [{
    name: "D. Okafor",
    pos: "PG",
    num: 3,
    age: 26,
    ovr: 94,
    mpg: 35.8,
    pts: 28.4,
    reb: 4.1,
    ast: 9.2,
    stl: 1.6,
    tp: 41.2,
    fg: 49.1,
    status: "OK",
    contract: "34.2M · 3 ans",
    onFire: true
  }, {
    name: "M. Ellison",
    pos: "SG",
    num: 11,
    age: 24,
    ovr: 86,
    mpg: 33.2,
    pts: 22.1,
    reb: 5.0,
    ast: 3.4,
    stl: 1.2,
    tp: 38.9,
    fg: 46.4,
    status: "OK",
    contract: "24.0M · 2 ans"
  }, {
    name: "T. Varga",
    pos: "SF",
    num: 7,
    age: 29,
    ovr: 81,
    mpg: 31.0,
    pts: 14.6,
    reb: 7.2,
    ast: 2.1,
    stl: 0.9,
    tp: 35.1,
    fg: 44.0,
    status: "DTD",
    contract: "18.5M · 1 an"
  }, {
    name: "R. Beaumont",
    pos: "PF",
    num: 21,
    age: 27,
    ovr: 74,
    mpg: 27.4,
    pts: 9.8,
    reb: 8.9,
    ast: 1.2,
    stl: 0.6,
    tp: 31.0,
    fg: 50.2,
    status: "OK",
    contract: "12.1M · 4 ans"
  }, {
    name: "S. Kovač",
    pos: "C",
    num: 33,
    age: 31,
    ovr: 69,
    mpg: 25.9,
    pts: 8.1,
    reb: 11.3,
    ast: 1.6,
    stl: 0.4,
    tp: 0.0,
    fg: 58.7,
    status: "OK",
    contract: "9.8M · 2 ans"
  }, {
    name: "J. Adeyemi",
    pos: "C",
    num: 45,
    age: 22,
    ovr: 61,
    mpg: 14.1,
    pts: 4.2,
    reb: 5.5,
    ast: 0.6,
    stl: 0.3,
    tp: 20.0,
    fg: 52.0,
    status: "OUT",
    contract: "2.4M · rookie"
  }, {
    name: "P. Nascimento",
    pos: "SG",
    num: 5,
    age: 28,
    ovr: 66,
    mpg: 18.3,
    pts: 7.4,
    reb: 2.1,
    ast: 2.8,
    stl: 0.7,
    tp: 36.6,
    fg: 42.1,
    status: "OK",
    contract: "6.0M · 1 an"
  }, {
    name: "H. Lindqvist",
    pos: "PF",
    num: 14,
    age: 25,
    ovr: 63,
    mpg: 12.7,
    pts: 5.1,
    reb: 3.8,
    ast: 0.9,
    stl: 0.5,
    tp: 33.3,
    fg: 47.5,
    status: "OK",
    contract: "3.2M · 2 ans"
  }],
  cap: {
    payroll: 182.4,
    cap: 140.6,
    taxLine: 170.8,
    apron1: 178.1,
    apron2: 188.9
  },
  standings: [{
    rank: 1,
    abbr: "BLZ",
    name: "Blaze",
    w: 41,
    l: 22,
    pct: ".651",
    gb: "—",
    streak: "W5",
    mine: true
  }, {
    rank: 2,
    abbr: "FRS",
    name: "Frost",
    w: 39,
    l: 24,
    pct: ".619",
    gb: "2.0",
    streak: "L1"
  }, {
    rank: 3,
    abbr: "STM",
    name: "Storm",
    w: 38,
    l: 25,
    pct: ".603",
    gb: "3.0",
    streak: "W3"
  }, {
    rank: 4,
    abbr: "QKE",
    name: "Quake",
    w: 36,
    l: 27,
    pct: ".571",
    gb: "5.0",
    streak: "W1"
  }, {
    rank: 5,
    abbr: "GLC",
    name: "Glacier",
    w: 35,
    l: 28,
    pct: ".556",
    gb: "6.0",
    streak: "L2"
  }, {
    rank: 6,
    abbr: "CMT",
    name: "Comets",
    w: 33,
    l: 30,
    pct: ".524",
    gb: "8.0",
    streak: "W2"
  }, {
    rank: 7,
    abbr: "TID",
    name: "Tide",
    w: 31,
    l: 32,
    pct: ".492",
    gb: "10.0",
    streak: "W1"
  }, {
    rank: 8,
    abbr: "PLS",
    name: "Pulse",
    w: 30,
    l: 33,
    pct: ".476",
    gb: "11.0",
    streak: "L1"
  }, {
    rank: 9,
    abbr: "RDG",
    name: "Ridge",
    w: 28,
    l: 35,
    pct: ".444",
    gb: "13.0",
    streak: "L4"
  }, {
    rank: 10,
    abbr: "DSK",
    name: "Dusk",
    w: 27,
    l: 36,
    pct: ".429",
    gb: "14.0",
    streak: "L2"
  }, {
    rank: 11,
    abbr: "MSA",
    name: "Mesa",
    w: 24,
    l: 39,
    pct: ".381",
    gb: "17.0",
    streak: "L5"
  }, {
    rank: 12,
    abbr: "HRB",
    name: "Harbor",
    w: 21,
    l: 42,
    pct: ".333",
    gb: "20.0",
    streak: "W1"
  }],
  nextGame: {
    away: {
      abbr: "FRS",
      name: "Frost",
      record: "39-24"
    },
    home: {
      abbr: "BLZ",
      name: "Blaze",
      record: "41-22"
    },
    tipoff: "20:30",
    day: "Ce soir"
  },
  live: {
    home: {
      abbr: "BLZ",
      record: "41-22"
    },
    away: {
      abbr: "FRS",
      record: "39-24"
    },
    period: "4TH",
    clock: "02:14",
    homeScore: 104,
    awayScore: 96,
    lineScore: {
      away: [24, 31, 22, 19],
      home: [30, 28, 29, 17]
    },
    events: [{
      id: 12,
      clock: "02:14",
      period: "Q4",
      type: "three",
      score: "104-96",
      hot: true,
      text: "OKAFOR à 3pts au buzzer de la possession ! 5e panier de suite — il est EN FEU."
    }, {
      id: 11,
      clock: "02:31",
      period: "Q4",
      type: "steal",
      score: "101-96",
      text: "Interception d'Ellison, qui lance la contre-attaque."
    }, {
      id: 10,
      clock: "02:44",
      period: "Q4",
      type: "turnover",
      score: "99-96",
      text: "Perte de balle de Frost sous la pression défensive."
    }, {
      id: 9,
      clock: "03:02",
      period: "Q4",
      type: "score",
      score: "99-96",
      text: "Kovač conclut au pied du panier après l'offensive rebound."
    }, {
      id: 8,
      clock: "03:20",
      period: "Q4",
      type: "foul",
      score: "97-96",
      text: "Faute offensive sifflée sur Marchetti (Frost)."
    }, {
      id: 7,
      clock: "03:38",
      period: "Q4",
      type: "block",
      score: "97-96",
      text: "CONTRE monstrueux de Beaumont sur la pénétration !"
    }, {
      id: 6,
      clock: "04:05",
      period: "Q4",
      type: "three",
      score: "97-96",
      text: "Okafor égalise à 3pts. Ambiance de feu à Ashford."
    }, {
      id: 5,
      clock: "04:29",
      period: "Q4",
      type: "score",
      score: "94-96",
      text: "Sørensen (Frost) en pull-up à mi-distance."
    }],
    boxHome: [{
      name: "D. Okafor",
      pos: "PG",
      min: 36,
      pts: 31,
      reb: 4,
      ast: 9,
      fg: "11-18",
      tp: "5-9",
      pm: 14,
      hot: true
    }, {
      name: "M. Ellison",
      pos: "SG",
      min: 34,
      pts: 22,
      reb: 5,
      ast: 3,
      fg: "8-16",
      tp: "3-7",
      pm: 11
    }, {
      name: "T. Varga",
      pos: "SF",
      min: 31,
      pts: 14,
      reb: 7,
      ast: 2,
      fg: "6-11",
      tp: "2-5",
      pm: 8
    }, {
      name: "R. Beaumont",
      pos: "PF",
      min: 28,
      pts: 9,
      reb: 11,
      ast: 1,
      fg: "4-8",
      tp: "0-1",
      pm: -3
    }, {
      name: "S. Kovač",
      pos: "C",
      min: 26,
      pts: 8,
      reb: 13,
      ast: 2,
      fg: "4-6",
      tp: "0-0",
      pm: 6
    }],
    boxAway: [{
      name: "L. Marchetti",
      pos: "PG",
      min: 35,
      pts: 26,
      reb: 3,
      ast: 7,
      fg: "9-19",
      tp: "4-9",
      pm: -9
    }, {
      name: "K. Sørensen",
      pos: "SG",
      min: 33,
      pts: 19,
      reb: 4,
      ast: 2,
      fg: "7-15",
      tp: "3-8",
      pm: -6
    }, {
      name: "A. Dubois",
      pos: "SF",
      min: 30,
      pts: 12,
      reb: 6,
      ast: 3,
      fg: "5-10",
      tp: "1-3",
      pm: -4
    }, {
      name: "G. Petrov",
      pos: "PF",
      min: 29,
      pts: 15,
      reb: 9,
      ast: 1,
      fg: "6-11",
      tp: "0-2",
      pm: -2
    }, {
      name: "N. Haddad",
      pos: "C",
      min: 27,
      pts: 10,
      reb: 8,
      ast: 1,
      fg: "5-8",
      tp: "0-0",
      pm: -5
    }]
  },
  featured: {
    name: "D. Okafor",
    pos: "PG",
    number: 3,
    age: 26,
    team: "BLZ",
    ovr: 94,
    contract: "34.2M · 3 ans",
    status: "OK",
    onFire: true,
    attributes: [{
      label: "Tir 3pts",
      value: 91
    }, {
      label: "Passe",
      value: 88
    }, {
      label: "Tir 2pts",
      value: 86
    }, {
      label: "Physique",
      value: 83
    }, {
      label: "Défense",
      value: 74
    }, {
      label: "Rebond",
      value: 52
    }],
    traits: ["Clutch", "Leader", "Iso Scorer", "Franchise"],
    seasonAvg: {
      gp: 61,
      pts: 28.4,
      reb: 4.1,
      ast: 9.2,
      stl: 1.6,
      tp: 41.2,
      fg: 49.1,
      min: 35.8
    },
    gamelog: [{
      g: "vs FRS",
      res: "V 118-104",
      min: 36,
      pts: 31,
      reb: 4,
      ast: 9,
      tp: "5-9",
      pm: 14,
      hot: true
    }, {
      g: "@ STM",
      res: "V 112-108",
      min: 38,
      pts: 26,
      reb: 3,
      ast: 11,
      tp: "3-7",
      pm: 6
    }, {
      g: "vs QKE",
      res: "V 121-99",
      min: 33,
      pts: 34,
      reb: 5,
      ast: 7,
      tp: "6-10",
      pm: 22,
      hot: true
    }, {
      g: "@ GLC",
      res: "D 101-107",
      min: 37,
      pts: 22,
      reb: 6,
      ast: 8,
      tp: "2-8",
      pm: -5
    }, {
      g: "vs CMT",
      res: "V 115-110",
      min: 35,
      pts: 29,
      reb: 2,
      ast: 12,
      tp: "4-6",
      pm: 9
    }, {
      g: "@ TID",
      res: "V 108-102",
      min: 34,
      pts: 24,
      reb: 4,
      ast: 6,
      tp: "3-9",
      pm: 4
    }, {
      g: "vs DSK",
      res: "D 98-104",
      min: 36,
      pts: 19,
      reb: 5,
      ast: 5,
      tp: "1-7",
      pm: -8
    }, {
      g: "@ MSA",
      res: "V 124-96",
      min: 29,
      pts: 27,
      reb: 3,
      ast: 10,
      tp: "5-8",
      pm: 18,
      hot: true
    }],
    splits: [{
      label: "Domicile",
      pts: 30.1,
      tp: 43.5
    }, {
      label: "Extérieur",
      pts: 26.7,
      tp: 38.4
    }, {
      label: "Clutch (±5, &lt;5min)",
      pts: 5.2,
      tp: 47.0
    }],
    recent: [{
      away: {
        abbr: "FRS",
        score: 104
      },
      home: {
        abbr: "BLZ",
        score: 118
      }
    }, {
      away: {
        abbr: "BLZ",
        score: 112
      },
      home: {
        abbr: "STM",
        score: 108
      }
    }, {
      away: {
        abbr: "QKE",
        score: 99
      },
      home: {
        abbr: "BLZ",
        score: 121
      }
    }]
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/fbl-manager/data.js", error: String((e && e.message) || e) }); }

__ds_ns.BoxScore = __ds_scope.BoxScore;

__ds_ns.CapSheet = __ds_scope.CapSheet;

__ds_ns.PlayByPlay = __ds_scope.PlayByPlay;

__ds_ns.PlayerCard = __ds_scope.PlayerCard;

__ds_ns.RatingBadge = __ds_scope.RatingBadge;

__ds_ns.ScoreBanner = __ds_scope.ScoreBanner;

__ds_ns.Standings = __ds_scope.Standings;

__ds_ns.StatTable = __ds_scope.StatTable;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.PositionBadge = __ds_scope.PositionBadge;

__ds_ns.InjuryBadge = __ds_scope.InjuryBadge;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.ToastStack = __ds_scope.ToastStack;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
