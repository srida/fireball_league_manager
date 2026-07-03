/**
 * Résolution d'une possession — machine à états (spec-possession-algorithm.md §2-§9).
 * `resolvePossession` est la fonction cœur du moteur : pure, seedée, produit un
 * log d'événements (source de vérité — box scores dérivés, jamais calculés à part).
 *
 * P1 : seuls `physical` et `skills` sont actifs (spec-player-model §9). Les hooks
 * P2 (`pressureModifier`, `gameStaminaFactor`) sont appelés mais renvoient
 * l'identité (CLAUDE.md — scope P1). `mental`/`hidden` ne pilotent aucune formule ici.
 */
import {
  ACTION_MODIFIERS,
  ACTION_PROBABILITY,
  AND_ONE,
  BLOCK,
  CLOCK_CONSUMPTION,
  PUTBACK,
  REBOUND,
  SHOT_SELECTION,
  SHOT_SUCCESS,
  USAGE,
  gameStaminaFactor,
  pressureModifier,
} from "../config/tuning.js";
import type { RNG } from "../utils/rng.js";
import type {
  ContestLevel,
  Event,
  GameState,
  OnCourtPlayer,
  ShotType,
  TeamSide,
  TurnoverCause,
} from "../types/index.js";

export interface PossessionResult {
  events: Event[];
  points: number;
  clockUsed: number;
  nextPossession: TeamSide;
}

function otherSide(side: TeamSide): TeamSide {
  return side === "HOME" ? "AWAY" : "HOME";
}

function avg(...values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** spec §3 — usageWeight(p) = w1·ballHandling + w2·courtVision + w3·moyenne(finishing,midRange,threePoint) × positionFactor × gameStaminaFactor. */
function usageWeight(p: OnCourtPlayer): number {
  const { effective, player } = p;
  const raw =
    USAGE.w1BallHandling * effective.ballHandling +
    USAGE.w2CourtVision * effective.courtVision +
    USAGE.w3ScoringAverage * avg(effective.finishing, effective.midRange, effective.threePoint);
  return raw * USAGE.positionFactor[player.position] * gameStaminaFactor(player.state.gameStamina);
}

function chooseCarrier(offense: readonly OnCourtPlayer[], rng: RNG, exclude?: string): OnCourtPlayer {
  const pool = exclude ? offense.filter((p) => p.player.id !== exclude) : offense;
  const candidates = pool.length > 0 ? pool : offense;
  return rng.weightedPick(candidates.map((p) => ({ item: p, weight: Math.max(usageWeight(p), 0.01) })));
}

/** P1 : matching poste pour poste (spec §3 fin). Fallback sur le premier défenseur disponible. */
function matchDefender(carrier: OnCourtPlayer, defense: readonly OnCourtPlayer[]): OnCourtPlayer {
  const samePosition = defense.find((d) => d.player.position === carrier.player.position);
  return samePosition ?? (defense[0] as OnCourtPlayer);
}

type ActionType = "SHOT" | "PASS" | "TURNOVER" | "FOUL_DRAWN";

function chooseAction(
  carrier: OnCourtPlayer,
  defender: OnCourtPlayer,
  clockRemainingInPossession: number,
  passCount: number,
  rng: RNG,
): ActionType {
  if (clockRemainingInPossession <= 0) return "SHOT";

  const cEff = carrier.effective;
  const dEff = defender.effective;

  const shooterSkill = avg(cEff.finishing, cEff.midRange, cEff.threePoint);
  const defenderSkill = avg(dEff.onBallDefense, dEff.lateralQuickness);

  let pShot =
    ACTION_PROBABILITY.base.shot *
    (1 + ACTION_MODIFIERS.shotSkillDeltaWeight * (shooterSkill - defenderSkill));

  let pPass =
    ACTION_PROBABILITY.base.pass *
    (1 + ACTION_MODIFIERS.passSkillWeight * (avg(cEff.courtVision, cEff.passing) - 75)) *
    Math.max(0, 1 - ACTION_MODIFIERS.passDecayPerPass * passCount);

  let pTurnover =
    ACTION_PROBABILITY.base.turnover *
    (1 - ACTION_MODIFIERS.turnoverHandlingWeight * (cEff.ballHandling - 75)) *
    (1 + ACTION_MODIFIERS.turnoverDefenseStealWeight * (dEff.steal - 75));

  let pFoul =
    ACTION_PROBABILITY.base.foulDrawn *
    (1 + ACTION_MODIFIERS.foulDrawnAttackWeight * (avg(cEff.finishing, cEff.postPlay) - 75));

  pShot = Math.max(pShot, 0.001);
  pPass = Math.max(pPass, 0.001);
  pTurnover = Math.max(pTurnover, 0.001);
  pFoul = Math.max(pFoul, 0.001);

  // Horloge courte : le tir devient de plus en plus forcé (100 % à 0 s, spec §4).
  if (clockRemainingInPossession <= ACTION_PROBABILITY.shotForcedBelowClockSeconds) {
    const forcedRatio =
      1 - clockRemainingInPossession / ACTION_PROBABILITY.shotForcedBelowClockSeconds;
    const remaining = 1 - forcedRatio;
    pShot = forcedRatio + pShot * remaining;
    pPass *= remaining;
    pTurnover *= remaining;
    pFoul *= remaining;
  }

  return rng.weightedPick([
    { item: "SHOT" as const, weight: pShot },
    { item: "PASS" as const, weight: pPass },
    { item: "TURNOVER" as const, weight: pTurnover },
    { item: "FOUL_DRAWN" as const, weight: pFoul },
  ]);
}

/** spec §5 — p(shotType) ∝ base × f(attribut), f convexe. `isPutback` : biais fort vers le cercle (§7). */
function chooseShotType(shooter: OnCourtPlayer, rng: RNG, isPutback: boolean): ShotType {
  const eff = shooter.effective;
  const f = (attr: number) => Math.pow(Math.max(attr, 0) / 99, SHOT_SELECTION.convexityExponent);

  const pThree = SHOT_SELECTION.baseThree * f(eff.threePoint);
  const pMid = SHOT_SELECTION.baseMidRange * f(eff.midRange);
  let pRim = SHOT_SELECTION.baseRim * f(avg(eff.finishing, eff.speed, eff.postPlay));
  if (isPutback) pRim *= PUTBACK.rimBiasMultiplier;

  return rng.weightedPick([
    { item: "THREE" as const, weight: Math.max(pThree, 0.001) },
    { item: "MID_RANGE" as const, weight: Math.max(pMid, 0.001) },
    { item: "RIM" as const, weight: Math.max(pRim, 0.001) },
  ]);
}

function defenseAttrForZone(defEff: OnCourtPlayer["effective"], shotType: ShotType): number {
  if (shotType === "RIM") return avg(defEff.onBallDefense, defEff.strength);
  return avg(defEff.onBallDefense, defEff.lateralQuickness);
}

function chooseContest(offBallDefense: number, passerCourtVision: number, rng: RNG): ContestLevel {
  // Plus l'offBallDefense adverse est élevée (et moins le passeur voit le jeu), plus le tir est contesté.
  const openWeight = Math.max(100 - offBallDefense + passerCourtVision / 2, 1);
  const contestedWeight = Math.max(offBallDefense, 1);
  const heavyWeight = Math.max(offBallDefense - 40, 1) * 0.6;
  return rng.weightedPick([
    { item: "OPEN" as const, weight: openWeight },
    { item: "CONTESTED" as const, weight: contestedWeight },
    { item: "HEAVILY_CONTESTED" as const, weight: heavyWeight },
  ]);
}

/** spec §6.1 — pMake borné dans [pMakeMin, pMakeMax] quelles que soient les valeurs d'attributs. */
export function computePMake(
  shotType: ShotType,
  shooterAttr: number,
  defAttr: number,
  contest: ContestLevel,
  isHome: boolean,
  pressureMod = 1,
  fatigueFactor = 1,
): number {
  const baseFG = SHOT_SUCCESS.baseFG[shotType];
  const attackFactor = 1 + SHOT_SUCCESS.attackFactorK * ((shooterAttr - 75) / 100);
  const defenseFactor = 1 - SHOT_SUCCESS.defenseFactorD * ((defAttr - 75) / 100);
  const contestFactor = SHOT_SUCCESS.contestFactor[contest];
  const homeFactor = isHome ? 1 + SHOT_SUCCESS.homeFactorBonus : 1;

  const raw =
    baseFG * attackFactor * defenseFactor * contestFactor * fatigueFactor * pressureMod * homeFactor;

  return Math.min(SHOT_SUCCESS.pMakeMax, Math.max(SHOT_SUCCESS.pMakeMin, raw));
}

interface ShotResolution {
  events: Event[];
  points: number;
  ended: boolean; // true si la possession se termine ici (panier)
  offensiveRebound: boolean;
}

function resolveShot(
  offense: readonly OnCourtPlayer[],
  defense: readonly OnCourtPlayer[],
  shooter: OnCourtPlayer,
  defender: OnCourtPlayer,
  isHome: boolean,
  lastPasser: string | undefined,
  isPutback: boolean,
  clock: number,
  rng: RNG,
): ShotResolution {
  const shotType = chooseShotType(shooter, rng, isPutback);
  const events: Event[] = [];

  // spec §6.2 — Contre, avant le tirage du tir, surtout au cercle.
  const pBlockBase = shotType === "RIM" ? BLOCK.pBlockRim : BLOCK.pBlockElsewhere;
  const rimProtector = [...defense].sort((a, b) => b.effective.block - a.effective.block)[0] as OnCourtPlayer;
  const blocked = rng.bool(Math.min(pBlockBase * (rimProtector.effective.block / 75), 1));

  if (blocked) {
    events.push({
      t: "SHOT",
      player: shooter.player.id,
      shotType,
      result: "BLOCK",
      contest: "HEAVILY_CONTESTED",
      blockedBy: rimProtector.player.id,
      clock,
    });
    return { events, points: 0, ended: false, offensiveRebound: false };
  }

  const passer = lastPasser ? offense.find((p) => p.player.id === lastPasser) : undefined;
  const contest = chooseContest(
    Math.max(...defense.map((d) => d.effective.offBallDefense)),
    passer?.effective.courtVision ?? 50,
    rng,
  );

  const defAttr = defenseAttrForZone(defender.effective, shotType);
  const shooterAttr =
    shotType === "THREE"
      ? shooter.effective.threePoint
      : shotType === "MID_RANGE"
        ? shooter.effective.midRange
        : shooter.effective.finishing;

  const pressureMod = pressureModifier(shooter.player.hidden.trueComposure, shooter.player.mental.traits, 0);
  const fatigueFactor = gameStaminaFactor(shooter.player.state.gameStamina);
  const pMake = computePMake(shotType, shooterAttr, defAttr, contest, isHome, pressureMod, fatigueFactor);

  const made = rng.bool(pMake);

  if (!made) {
    events.push({ t: "SHOT", player: shooter.player.id, shotType, result: "MISS", contest, clock });
    return { events, points: 0, ended: false, offensiveRebound: false };
  }

  const assistBy = passer?.player.id;
  events.push({
    t: "SHOT",
    player: shooter.player.id,
    shotType,
    result: "MAKE",
    contest,
    clock,
    ...(assistBy ? { assistBy } : {}),
  });

  let totalPoints = shotType === "THREE" ? 3 : 2;

  // spec §6.2 — And-one.
  const pAndOne = Math.min(rng.float(AND_ONE.min, AND_ONE.max) * (shooter.effective.strength / 75), 1);
  if (rng.bool(pAndOne)) {
    events.push({ t: "FOUL", player: defender.player.id, on: shooter.player.id, type: "SHOOTING", clock });
    const ft = resolveFreeThrows(shooter, 1, 1, rng, clock);
    events.push(...ft.events);
    totalPoints += ft.made;
  }

  return { events, points: totalPoints, ended: true, offensiveRebound: false };
}

function resolveFreeThrows(
  shooter: OnCourtPlayer,
  count: number,
  startIndex: number,
  rng: RNG,
  clock: number,
): { events: Event[]; made: number } {
  const events: Event[] = [];
  let made = 0;
  const pMake = shooter.effective.freeThrow / 100;
  for (let i = 0; i < count; i++) {
    const success = rng.bool(pMake);
    if (success) made++;
    events.push({
      t: "FREE_THROW",
      player: shooter.player.id,
      result: success ? "MAKE" : "MISS",
      index: startIndex + i,
      total: startIndex + count - 1,
      clock,
    });
  }
  return { events, made };
}

function reboundWeight(p: OnCourtPlayer, side: "OFF" | "DEF"): number {
  const eff = p.effective;
  const skill = side === "OFF" ? eff.offRebound : eff.defRebound;
  const physical =
    REBOUND.physicalWeightCoefficients.heightCm * (p.player.heightCm / 220) +
    REBOUND.physicalWeightCoefficients.wingspanCm * (p.player.wingspanCm / 230) +
    REBOUND.physicalWeightCoefficients.vertical * (eff.vertical / 99) +
    REBOUND.physicalWeightCoefficients.strength * (eff.strength / 99);
  return Math.max(skill * (1 + physical), 1);
}

function resolveRebound(
  offense: readonly OnCourtPlayer[],
  defense: readonly OnCourtPlayer[],
  clock: number,
  rng: RNG,
): { events: Event[]; side: "OFF" | "DEF"; player: OnCourtPlayer } {
  const offWeights = offense.map((p) => ({ p, w: reboundWeight(p, "OFF") }));
  const defWeights = defense.map((p) => ({ p, w: reboundWeight(p, "DEF") }));
  const sumOff = offWeights.reduce((s, x) => s + x.w, 0);
  const sumDef = defWeights.reduce((s, x) => s + x.w, 0);

  const pOffensiveRebound = sumOff / (sumOff + REBOUND.defensiveWeightMultiplierB * sumDef);
  const isOffensive = rng.bool(pOffensiveRebound);

  const pool = isOffensive ? offWeights : defWeights;
  const rebounder = rng.weightedPick(pool.map((x) => ({ item: x.p, weight: x.w })));

  return {
    events: [{ t: "REBOUND", player: rebounder.player.id, side: isOffensive ? "OFF" : "DEF", clock }],
    side: isOffensive ? "OFF" : "DEF",
    player: rebounder,
  };
}

function resolveTurnover(carrier: OnCourtPlayer, defender: OnCourtPlayer, clock: number, rng: RNG): Event[] {
  const cEff = carrier.effective;
  const dEff = defender.effective;

  // P1 : discipline (mental) n'est pas actif — seule la technique (skills) pilote les causes.
  const stealWeight = Math.max(dEff.steal - 40, 1);
  const offensiveFoulWeight = ACTION_MODIFIERS.turnoverOffensiveFoulBaseWeight;
  const handleWeight = Math.max(100 - cEff.ballHandling, 1);
  const badPassWeight = Math.max(100 - cEff.passing, 1) * 0.7;

  const cause = rng.weightedPick<TurnoverCause>([
    { item: "STEAL", weight: stealWeight },
    { item: "OFFENSIVE_FOUL", weight: offensiveFoulWeight },
    { item: "HANDLE", weight: handleWeight },
    { item: "BAD_PASS", weight: badPassWeight },
  ]);

  const events: Event[] = [];
  if (cause === "OFFENSIVE_FOUL") {
    events.push({ t: "FOUL", player: carrier.player.id, on: defender.player.id, type: "OFFENSIVE", clock });
  }
  events.push({
    t: "TURNOVER",
    player: carrier.player.id,
    cause,
    clock,
    ...(cause === "STEAL" ? { stealBy: defender.player.id } : {}),
  });
  return events;
}

/**
 * Résout une possession complète (spec-possession-algorithm.md §2).
 * `state.clockSeconds` est l'horloge de quart-temps restante ; la possession
 * ne peut consommer plus que cette réserve (troncature de fin de quart-temps).
 */
export function resolvePossession(state: GameState, rng: RNG): PossessionResult {
  const offenseSide = state.possession;
  const defenseSide = otherSide(offenseSide);
  const offense = state.onCourt[offenseSide];
  const defense = state.onCourt[defenseSide];
  const isHome = offenseSide === "HOME";

  const events: Event[] = [];
  let clockUsed = 0;
  let quarterClockRemaining = state.clockSeconds;

  const setupTime = Math.min(
    rng.float(CLOCK_CONSUMPTION.setup.min, CLOCK_CONSUMPTION.setup.max),
    quarterClockRemaining,
  );
  clockUsed += setupTime;
  quarterClockRemaining -= setupTime;

  let shotClockRemaining = 24;
  let passCount = 0;
  let carrier = chooseCarrier(offense, rng);
  let lastPasser: string | undefined;
  let isPutback = false;

  // Le nombre d'itérations est borné (maxPasses + 1) par cycle offensif ; les
  // rebonds offensifs relancent un nouveau cycle (spec §7), bornés eux aussi
  // pour éviter toute boucle infinie théorique.
  for (let cycle = 0; cycle < 20; cycle++) {
    let resolvedThisCycle = false;

    for (let step = 0; step <= ACTION_PROBABILITY.maxPassesPerPossession; step++) {
      const clockRemaining = Math.min(shotClockRemaining, quarterClockRemaining);
      const defender = matchDefender(carrier, defense);

      const forced = clockRemaining <= 0 || step === ACTION_PROBABILITY.maxPassesPerPossession;
      const action: ActionType = forced ? "SHOT" : chooseAction(carrier, defender, clockRemaining, passCount, rng);

      if (action === "SHOT") {
        const creationTime = Math.min(
          rng.float(CLOCK_CONSUMPTION.shotCreation.min, CLOCK_CONSUMPTION.shotCreation.max),
          quarterClockRemaining,
        );
        clockUsed += creationTime;
        quarterClockRemaining -= creationTime;

        const shot = resolveShot(
          offense,
          defense,
          carrier,
          defender,
          isHome,
          lastPasser,
          isPutback,
          quarterClockRemaining,
          rng,
        );
        events.push(...shot.events);

        if (shot.ended) {
          return { events, points: shot.points, clockUsed, nextPossession: defenseSide };
        }

        // Tir raté ou contré → rebond.
        const rebound = resolveRebound(offense, defense, quarterClockRemaining, rng);
        events.push(...rebound.events);

        if (rebound.side === "DEF" || quarterClockRemaining <= 0) {
          return { events, points: 0, clockUsed, nextPossession: defenseSide };
        }

        // Rebond offensif : nouveau cycle, horloge des 14 s, putback favorisé.
        shotClockRemaining = Math.min(14, quarterClockRemaining);
        passCount = 0;
        lastPasser = undefined;
        isPutback = true;
        carrier = rebound.player;
        resolvedThisCycle = true;
        break;
      }

      if (action === "TURNOVER") {
        events.push(...resolveTurnover(carrier, defender, quarterClockRemaining, rng));
        return { events, points: 0, clockUsed, nextPossession: defenseSide };
      }

      if (action === "FOUL_DRAWN") {
        events.push({
          t: "FOUL",
          player: defender.player.id,
          on: carrier.player.id,
          type: "SHOOTING",
          clock: quarterClockRemaining,
        });
        const ft = resolveFreeThrows(carrier, 2, 1, rng, quarterClockRemaining);
        events.push(...ft.events);
        return { events, points: ft.made, clockUsed, nextPossession: defenseSide };
      }

      // PASS
      const passTime = Math.min(
        rng.float(CLOCK_CONSUMPTION.perPass.min, CLOCK_CONSUMPTION.perPass.max),
        quarterClockRemaining,
      );
      clockUsed += passTime;
      quarterClockRemaining -= passTime;
      shotClockRemaining -= passTime;
      passCount++;
      lastPasser = carrier.player.id;
      carrier = chooseCarrier(offense, rng, carrier.player.id);
    }

    if (!resolvedThisCycle) {
      // Filet de sécurité : horloge épuisée sans résolution explicite.
      return { events, points: 0, clockUsed, nextPossession: defenseSide };
    }
  }

  // Filet de sécurité théorique (20 rebonds offensifs d'affilée) : fin de possession.
  return { events, points: 0, clockUsed, nextPossession: defenseSide };
}
