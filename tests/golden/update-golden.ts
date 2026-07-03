/**
 * Régénère le hash golden master committé (npm run golden:update).
 * À lancer explicitement après un retuning volontaire du moteur — joindre le
 * diff des distributions batch au commit (spec-tests-phase1.md §4).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeGoldenHash } from "./golden-master.js";

const hash = computeGoldenHash();
const outPath = join(dirname(fileURLToPath(import.meta.url)), "golden-hash.txt");
writeFileSync(outPath, hash + "\n", "utf-8");
console.log(`Golden hash régénéré : ${hash}`);
console.log(`Écrit dans ${outPath}`);
