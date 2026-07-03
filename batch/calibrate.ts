/**
 * Analyse de sensibilité (spec-possession-algorithm.md §11 : "un script
 * batch/calibrate fait varier les ⚙ un par un et compare les distributions
 * obtenues aux cibles"). Fait varier un sous-ensemble de constantes clés de
 * `tuning.ts` autour de leur valeur actuelle, rejoue un petit batch pour
 * chacune, et rapporte l'effet sur les métriques les plus concernées.
 *
 * Usage : `npm run calibrate` (ou `npm run calibrate -- --seasons=8 --seed=X`).
 * Mute temporairement `tuning.ts` en mémoire (objets `as const` non gelés à
 * l'exécution) puis restaure la valeur d'origine après chaque variante —
 * n'écrit jamais dans le fichier source. Outil de diagnostic, pas une boucle
 * d'auto-calibration : les valeurs restent à ajuster à la main dans tuning.ts.
 */
import { generateLeague } from "../engine/generation/league.js";
import { simulateSeason } from "../engine/season/season.js";
import { createRng } from "../engine/utils/rng.js";
import { BatchAccumulator, type SeasonMetrics } from "./metrics.js";
import {
  ACTION_PROBABILITY,
  REBOUND,
  SHOT_SELECTION,
  SHOT_SUCCESS,
} from "../engine/config/tuning.js";

interface Knob {
  label: string;
  metricsToWatch: (keyof SeasonMetrics)[];
  candidates: number[];
  apply: (value: number) => void;
  currentValue: () => number;
}

// `as const` empêche les réassignations *au niveau du type*, pas à l'exécution :
// on caste en `any` uniquement ici, dans un outil de diagnostic hors moteur.
/* eslint-disable @typescript-eslint/no-explicit-any */
const mutableActionProbabilityBase = ACTION_PROBABILITY.base as any;
const mutableShotSelection = SHOT_SELECTION as any;
const mutableShotSuccess = SHOT_SUCCESS as any;
const mutableRebound = REBOUND as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const KNOBS: Knob[] = [
  {
    label: "ACTION_PROBABILITY.base.turnover",
    metricsToWatch: ["turnoversPerTeamPerGame", "pointsPerTeamPerGame"],
    candidates: [0.045, 0.062, 0.08],
    apply: (v) => (mutableActionProbabilityBase.turnover = v),
    currentValue: () => ACTION_PROBABILITY.base.turnover,
  },
  {
    label: "SHOT_SELECTION.baseThree",
    metricsToWatch: ["threePointAttemptShare", "fgPercent"],
    candidates: [0.34, 0.42, 0.5],
    apply: (v) => (mutableShotSelection.baseThree = v),
    currentValue: () => SHOT_SELECTION.baseThree,
  },
  {
    label: "SHOT_SUCCESS.homeFactorBonus",
    metricsToWatch: ["homeWinPercent"],
    candidates: [0.015, 0.025, 0.035],
    apply: (v) => (mutableShotSuccess.homeFactorBonus = v),
    currentValue: () => SHOT_SUCCESS.homeFactorBonus,
  },
  {
    label: "SHOT_SUCCESS.attackFactorK / defenseFactorD (couplés)",
    metricsToWatch: ["talentWinsCorrelation", "topScorerPpg"],
    candidates: [0.35, 0.9, 1.13],
    apply: (v) => {
      mutableShotSuccess.attackFactorK = v;
      mutableShotSuccess.defenseFactorD = v * 0.8;
    },
    currentValue: () => SHOT_SUCCESS.attackFactorK,
  },
  {
    label: "REBOUND.defensiveWeightMultiplierB",
    metricsToWatch: ["offensiveReboundShare"],
    candidates: [1.35, 2.0, 2.6],
    apply: (v) => (mutableRebound.defensiveWeightMultiplierB = v),
    currentValue: () => REBOUND.defensiveWeightMultiplierB,
  },
];

function parseArgs(argv: readonly string[]): { seasons: number; seed: string } {
  let seasons = 5;
  let seed = "fblm-calibrate-default";
  for (const arg of argv) {
    const seasonsMatch = /^--seasons=(\d+)$/.exec(arg);
    if (seasonsMatch) seasons = Number(seasonsMatch[1]);
    const seedMatch = /^--seed=(.+)$/.exec(arg);
    if (seedMatch) seed = seedMatch[1] as string;
  }
  return { seasons, seed };
}

function runBatch(league: ReturnType<typeof generateLeague>, seasons: number, seed: string): SeasonMetrics {
  const accumulator = new BatchAccumulator(league);
  for (let i = 0; i < seasons; i++) {
    accumulator.addSeason(simulateSeason(createRng(`${seed}-${i}`), league));
  }
  return accumulator.finalize();
}

async function main(): Promise<void> {
  const { seasons, seed } = parseArgs(process.argv.slice(2));
  const league = generateLeague(`${seed}-league`);

  console.log(`Analyse de sensibilité — ${seasons} saison(s) par variante, ligue seed="${seed}-league"\n`);

  for (const knob of KNOBS) {
    const original = knob.currentValue();
    console.log(`--- ${knob.label} (valeur actuelle : ${original}) ---`);

    const rows: Record<string, string | number>[] = [];
    for (const candidate of knob.candidates) {
      knob.apply(candidate);
      const metrics = runBatch(league, seasons, seed);
      const row: Record<string, string | number> = { valeur: candidate };
      for (const key of knob.metricsToWatch) {
        const value = metrics[key];
        row[key] = typeof value === "number" ? Number(value.toFixed(3)) : value;
      }
      rows.push(row);
    }
    knob.apply(original); // restaure la valeur d'origine avant le knob suivant

    console.table(rows);
  }
}

main();
