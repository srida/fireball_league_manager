import { createRng } from "../utils/rng.js";
import { generateId } from "../utils/id.js";
import { shuffle } from "../utils/array.js";
import { LEAGUE_GENERATION } from "../config/tuning.js";
import { CONFERENCES, DIVISIONS, TEAM_NICKNAMES } from "./names.js";
import type { League, Team } from "../types/index.js";
import type { RNG } from "../utils/rng.js";
import { generateRoster } from "./roster.js";

function makeAbbreviation(city: string, nickname: string, used: Set<string>): string {
  const letters = (s: string) => s.replace(/[^A-Za-zÀ-ÿ]/g, "").toUpperCase();
  const fromCity = letters(city).slice(0, 3);
  if (fromCity.length === 3 && !used.has(fromCity)) {
    used.add(fromCity);
    return fromCity;
  }
  const mixed = (letters(city).slice(0, 2) + letters(nickname).slice(0, 1)).padEnd(3, "X");
  if (!used.has(mixed)) {
    used.add(mixed);
    return mixed;
  }
  let suffix = 1;
  let candidate = `${letters(city).slice(0, 2)}${suffix}`;
  while (used.has(candidate)) {
    suffix++;
    candidate = `${letters(city).slice(0, 2)}${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Génère la ligue complète (30 équipes, 2 conférences, 6 divisions, rosters de
 * 15 joueurs) de façon entièrement déterministe à partir d'une seed.
 */
export function generateLeague(seed: string | number): League {
  const rng: RNG = createRng(seed);

  const nicknames = shuffle(rng, TEAM_NICKNAMES);
  const usedAbbreviations = new Set<string>();

  const teams: Team[] = [];
  let index = 0;
  for (const division of DIVISIONS) {
    const cities = shuffle(rng, division.cities);
    for (let i = 0; i < LEAGUE_GENERATION.teamsPerDivision; i++) {
      const city = cities[i] as string;
      const nickname = nicknames[index] as string;
      teams.push({
        id: generateId(rng),
        name: `${city} ${nickname}`,
        city,
        abbreviation: makeAbbreviation(city, nickname, usedAbbreviations),
        conference: division.conference,
        division: division.name,
        roster: generateRoster(rng),
      });
      index++;
    }
  }

  return {
    id: generateId(rng),
    seed: String(seed),
    conferences: [...CONFERENCES],
    divisions: DIVISIONS.map(({ name, conference }) => ({ name, conference })),
    teams,
  };
}
