/**
 * Smoke test — génère une ligue avec une seed fixe et affiche 3 rosters
 * pour inspection visuelle (npm run smoke).
 */
import { generateLeague } from "../engine/generation/league.js";
import { PLAYER_GENERATION } from "../engine/config/tuning.js";
import type { Player, Team } from "../engine/types/index.js";

const SEED = "fblm-smoke-test-v1";

function deriveAge(birthDate: string): number {
  const reference = new Date(PLAYER_GENERATION.referenceDate + "T00:00:00Z");
  const birth = new Date(birthDate + "T00:00:00Z");
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = reference.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getUTCDate() < birth.getUTCDate())) {
    age--;
  }
  return age;
}

function skillAverage(player: Player): number {
  const values = Object.values(player.skills);
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function physicalAverage(player: Player): number {
  const values = Object.values(player.physical);
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function printRoster(team: Team): void {
  console.log(`\n${"=".repeat(78)}`);
  console.log(
    `${team.name} (${team.abbreviation}) — ${team.conference} / ${team.division} — id=${team.id}`,
  );
  console.log("=".repeat(78));

  const rows = team.roster.map((p) => ({
    "#": p.jerseyNumber,
    Nom: `${p.firstName} ${p.lastName}`,
    Pos: [p.position, ...p.secondaryPositions].join("/"),
    Âge: deriveAge(p.birthDate),
    "Taille(cm)": p.heightCm,
    "Poids(kg)": p.weightKg,
    "Env.(cm)": p.wingspanCm,
    Main: p.handedness === "left" ? "G" : "D",
    Archétype: p.generation.archetypeId + (p.generation.offArchetype ? " *" : ""),
    "SKL moy.": skillAverage(p),
    "PHY moy.": physicalAverage(p),
    Origine: p.origin,
  }));

  console.table(rows);
}

function main(): void {
  console.log(`Génération de la ligue FBL — seed = "${SEED}"`);
  const league = generateLeague(SEED);

  console.log(`\nLigue générée : ${league.teams.length} équipes, ${league.conferences.length} conférences, ${league.divisions.length} divisions.`);
  console.log(`Conférences : ${league.conferences.join(", ")}`);
  console.log(`Divisions : ${league.divisions.map((d) => `${d.name} (${d.conference})`).join(", ")}`);

  const totalPlayers = league.teams.reduce((sum, t) => sum + t.roster.length, 0);
  console.log(`Total joueurs générés : ${totalPlayers}`);

  // 3 équipes réparties sur différentes divisions/conférences pour l'inspection.
  const sampleIndices = [0, 12, 27];
  for (const idx of sampleIndices) {
    const team = league.teams[idx];
    if (team) printRoster(team);
  }

  console.log(`\n(* = tirage hors-archétype, ~${PLAYER_GENERATION.offArchetypeRate * 100}% attendu)`);
}

main();
