import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeGoldenHash } from "./golden-master.js";

describe("Golden master — anti-régression (spec-tests-phase1.md §4)", () => {
  it("le hash du log d'une saison de référence correspond au hash committé", () => {
    const hashPath = join(dirname(fileURLToPath(import.meta.url)), "golden-hash.txt");
    const committedHash = readFileSync(hashPath, "utf-8").trim();
    const currentHash = computeGoldenHash();

    if (currentHash !== committedHash) {
      throw new Error(
        "Le hash golden master a changé : soit une régression, soit un retuning volontaire.\n" +
          "Si volontaire, relancer `npm run golden:update` et joindre le diff des distributions batch au commit.",
      );
    }
    expect(currentHash).toBe(committedHash);
  });
});
