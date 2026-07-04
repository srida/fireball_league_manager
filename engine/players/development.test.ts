import { describe, expect, it } from "vitest";
import { createRng } from "../utils/rng.js";
import { DEVELOPMENT } from "../config/tuning.js";
import {
  applyAnnualDevelopment,
  effectivePeakAge,
  physicalPeakAge,
  playerOverallRating,
  retirementProbability,
  rollRetirement,
  technicalPeakAge,
} from "./development.js";
import type { Player } from "../types/index.js";

/** Joueur minimal, entièrement déterministe — évite le bruit de `generatePlayer` pour ces tests de courbe. */
function makePlayer(overrides: {
  growthCurve?: Player["hidden"]["growthCurve"];
  peakAge?: number;
  potential?: number;
  declineRate?: number;
  workEthic?: number;
  coachability?: number;
  skillValue?: number;
  physicalValue?: number;
}): Player {
  const {
    growthCurve = "standard",
    peakAge = 27,
    potential = 80,
    declineRate = 50,
    workEthic = 57,
    coachability = 57,
    skillValue = 50,
    physicalValue = 50,
  } = overrides;

  return {
    id: "test-player",
    firstName: "Test",
    lastName: "Player",
    birthDate: "2000-01-01",
    heightCm: 200,
    weightKg: 95,
    wingspanCm: 205,
    position: "SF",
    secondaryPositions: [],
    handedness: "right",
    jerseyNumber: 0,
    origin: "Testville",
    physical: {
      speed: physicalValue,
      vertical: physicalValue,
      strength: physicalValue,
      lateralQuickness: physicalValue,
      stamina: physicalValue,
    },
    skills: {
      finishing: skillValue,
      midRange: skillValue,
      threePoint: skillValue,
      freeThrow: skillValue,
      ballHandling: skillValue,
      passing: skillValue,
      courtVision: skillValue,
      postPlay: skillValue,
      onBallDefense: skillValue,
      offBallDefense: skillValue,
      block: skillValue,
      steal: skillValue,
      offRebound: skillValue,
      defRebound: skillValue,
      defensiveIQ: skillValue,
    },
    mental: {
      leadership: 57,
      composure: 57,
      competitiveness: 57,
      discipline: 57,
      coachability,
      workEthic,
      ego: 57,
      traits: [],
    },
    hidden: {
      potential,
      growthCurve,
      injuryProneness: 30,
      trueComposure: 55,
      peakAge,
      declineRate,
    },
    state: { morale: 70, fitness: 100, gameStamina: 100, injury: { type: null, remainingGames: 0 }, form: 0 },
    generation: { archetypeId: "TWO_WAY_WING", offArchetype: false },
  };
}

describe("effectivePeakAge / physicalPeakAge / technicalPeakAge (spec-player-model §5, plan P3 §Session 1)", () => {
  it("growthCurve décale le pic effectif : précoce plus tôt, tardif plus tard", () => {
    const early = makePlayer({ growthCurve: "early", peakAge: 27 });
    const standard = makePlayer({ growthCurve: "standard", peakAge: 27 });
    const late = makePlayer({ growthCurve: "late", peakAge: 27 });
    expect(effectivePeakAge(early)).toBeLessThan(effectivePeakAge(standard));
    expect(effectivePeakAge(late)).toBeGreaterThan(effectivePeakAge(standard));
  });

  it("le physique pique avant le technique, à growthCurve égal (spec : le physique décline en premier)", () => {
    const player = makePlayer({ growthCurve: "standard", peakAge: 27 });
    expect(physicalPeakAge(player)).toBeLessThan(technicalPeakAge(player));
  });
});

describe("applyAnnualDevelopment — progression (jeune loin du potentiel)", () => {
  it("un jeune joueur loin de son potentiel, à fort temps de jeu, progresse en technique et en physique", () => {
    const player = makePlayer({ peakAge: 27, potential: 90, skillValue: 50, physicalValue: 50 });
    // 20 ans, très en dessous du pic technique (~28) et physique (~26) : phase de progression pure.
    applyAnnualDevelopment(player, 20, 1);
    expect(player.skills.finishing).toBeGreaterThan(50);
    expect(player.physical.speed).toBeGreaterThan(50);
  });

  it("un jeune sur le banc (minutesShare = 0) progresse quand même, mais moins qu'à pleine charge", () => {
    const benched = makePlayer({ peakAge: 27, potential: 90, skillValue: 50 });
    const starter = makePlayer({ peakAge: 27, potential: 90, skillValue: 50 });
    applyAnnualDevelopment(benched, 20, 0);
    applyAnnualDevelopment(starter, 20, 1);
    expect(benched.skills.finishing).toBeGreaterThan(50);
    expect(benched.skills.finishing).toBeLessThan(starter.skills.finishing);
  });

  it("un attribut ne dépasse jamais le plafond `potential`, même après de nombreuses saisons", () => {
    const player = makePlayer({ peakAge: 30, potential: 70, skillValue: 68 });
    for (let age = 19; age < 25; age++) {
      applyAnnualDevelopment(player, age, 1);
      for (const value of Object.values(player.skills)) {
        expect(value).toBeLessThanOrEqual(70 + 0.001);
      }
    }
  });

  it("un workEthic élevé progresse plus vite qu'un workEthic faible, toutes choses égales par ailleurs", () => {
    const diligent = makePlayer({ peakAge: 27, potential: 90, skillValue: 50, workEthic: 90, coachability: 57 });
    const lazy = makePlayer({ peakAge: 27, potential: 90, skillValue: 50, workEthic: 20, coachability: 57 });
    applyAnnualDevelopment(diligent, 20, 1);
    applyAnnualDevelopment(lazy, 20, 1);
    expect(diligent.skills.finishing).toBeGreaterThan(lazy.skills.finishing);
  });
});

describe("applyAnnualDevelopment — déclin (après le pic)", () => {
  it("après le pic, les attributs déclinent plutôt que de progresser", () => {
    const player = makePlayer({ peakAge: 27, potential: 90, skillValue: 80, physicalValue: 80 });
    applyAnnualDevelopment(player, 34, 1);
    expect(player.skills.finishing).toBeLessThan(80);
    expect(player.physical.speed).toBeLessThan(80);
  });

  it("à âge égal après le pic, le physique décline plus vite que le technique", () => {
    const player = makePlayer({ peakAge: 27, potential: 90, skillValue: 80, physicalValue: 80 });
    applyAnnualDevelopment(player, 34, 1);
    const skillLoss = 80 - player.skills.finishing;
    const physicalLoss = 80 - player.physical.speed;
    expect(physicalLoss).toBeGreaterThan(skillLoss);
  });

  it("un déclin ne descend jamais sous 0, même sur une longue carrière simulée", () => {
    const player = makePlayer({ peakAge: 24, potential: 60, skillValue: 20, physicalValue: 20, declineRate: 95 });
    for (let age = 30; age < 50; age++) {
      applyAnnualDevelopment(player, age, 1);
    }
    for (const value of [...Object.values(player.skills), ...Object.values(player.physical)]) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it("un workEthic élevé atténue le déclin par rapport à un workEthic faible", () => {
    const disciplined = makePlayer({ peakAge: 27, potential: 90, skillValue: 80, workEthic: 90 });
    const careless = makePlayer({ peakAge: 27, potential: 90, skillValue: 80, workEthic: 20 });
    applyAnnualDevelopment(disciplined, 34, 1);
    applyAnnualDevelopment(careless, 34, 1);
    expect(disciplined.skills.finishing).toBeGreaterThan(careless.skills.finishing);
  });
});

describe("retirementProbability / rollRetirement (plan-développement §Phase 3 — Session 1)", () => {
  it("nulle bien avant le seuil de retraite, croissante avec l'âge au-delà", () => {
    const player = makePlayer({ skillValue: 70, physicalValue: 70 });
    expect(retirementProbability(player, 25)).toBe(0);
    const at35 = retirementProbability(player, 35);
    const at40 = retirementProbability(player, 40);
    expect(at35).toBeGreaterThan(0);
    expect(at40).toBeGreaterThan(at35);
  });

  it("retraite forcée (probabilité 1) à partir de `DEVELOPMENT.retirement.hardRetireAge`", () => {
    const player = makePlayer({});
    expect(retirementProbability(player, DEVELOPMENT.retirement.hardRetireAge)).toBe(1);
  });

  it("un joueur vieillissant à faible niveau a une probabilité de retraite plus élevée qu'un vieillissant encore performant", () => {
    const declining = makePlayer({ skillValue: 30, physicalValue: 30 });
    const stillGood = makePlayer({ skillValue: 85, physicalValue: 85 });
    expect(retirementProbability(declining, 32)).toBeGreaterThan(retirementProbability(stillGood, 32));
  });

  it("rollRetirement est déterministe pour une seed donnée", () => {
    const player = makePlayer({});
    player.hidden.declineRate = 50;
    const a = rollRetirement(createRng("retire-seed"), player, DEVELOPMENT.retirement.hardRetireAge);
    const b = rollRetirement(createRng("retire-seed"), player, DEVELOPMENT.retirement.hardRetireAge);
    expect(a).toBe(b);
    expect(a).toBe(true); // hardRetireAge ⇒ probabilité 1, toujours vrai
  });
});

describe("playerOverallRating", () => {
  it("moyenne pondérée technique/physique, cohérente avec des valeurs uniformes", () => {
    const player = makePlayer({ skillValue: 80, physicalValue: 60 });
    expect(playerOverallRating(player)).toBeCloseTo(80 * 0.7 + 60 * 0.3, 5);
  });
});
