import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE_ROOT = fileURLToPath(new URL("../", import.meta.url));

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("garde-fou RNG (spec-tests-phase1 §1 — RNG seedé)", () => {
  it("aucun Math.random() n'est utilisé dans /engine (CLAUDE.md — RNG injecté obligatoire)", () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(ENGINE_ROOT)) {
      const content = readFileSync(file, "utf-8");
      // Ignore commentaires (block /* */ et ligne //) pour ne pas se déclencher
      // sur des mentions documentaires de l'interdiction elle-même.
      const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      if (withoutComments.includes("Math.random(")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
