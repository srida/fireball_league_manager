/* Fake but realistic FBL data — fully procedural/anonymised, no real names. */
window.FBL_DATA = {
  team: { abbr: "BLZ", name: "Blaze", city: "Ashford", conf: "Ouest", div: "Pacifique", record: "41-22", streak: "W5", seed: 1 },

  roster: [
    { name: "D. Okafor",    pos: "PG", num: 3,  age: 26, ovr: 94, mpg: 35.8, pts: 28.4, reb: 4.1, ast: 9.2, stl: 1.6, tp: 41.2, fg: 49.1, status: "OK",  contract: "34.2M · 3 ans", onFire: true },
    { name: "M. Ellison",   pos: "SG", num: 11, age: 24, ovr: 86, mpg: 33.2, pts: 22.1, reb: 5.0, ast: 3.4, stl: 1.2, tp: 38.9, fg: 46.4, status: "OK",  contract: "24.0M · 2 ans" },
    { name: "T. Varga",     pos: "SF", num: 7,  age: 29, ovr: 81, mpg: 31.0, pts: 14.6, reb: 7.2, ast: 2.1, stl: 0.9, tp: 35.1, fg: 44.0, status: "DTD", contract: "18.5M · 1 an" },
    { name: "R. Beaumont",  pos: "PF", num: 21, age: 27, ovr: 74, mpg: 27.4, pts: 9.8,  reb: 8.9, ast: 1.2, stl: 0.6, tp: 31.0, fg: 50.2, status: "OK",  contract: "12.1M · 4 ans" },
    { name: "S. Kovač",     pos: "C",  num: 33, age: 31, ovr: 69, mpg: 25.9, pts: 8.1,  reb: 11.3, ast: 1.6, stl: 0.4, tp: 0.0, fg: 58.7, status: "OK",  contract: "9.8M · 2 ans" },
    { name: "J. Adeyemi",   pos: "C",  num: 45, age: 22, ovr: 61, mpg: 14.1, pts: 4.2,  reb: 5.5, ast: 0.6, stl: 0.3, tp: 20.0, fg: 52.0, status: "OUT", contract: "2.4M · rookie" },
    { name: "P. Nascimento",pos: "SG", num: 5,  age: 28, ovr: 66, mpg: 18.3, pts: 7.4,  reb: 2.1, ast: 2.8, stl: 0.7, tp: 36.6, fg: 42.1, status: "OK",  contract: "6.0M · 1 an" },
    { name: "H. Lindqvist", pos: "PF", num: 14, age: 25, ovr: 63, mpg: 12.7, pts: 5.1,  reb: 3.8, ast: 0.9, stl: 0.5, tp: 33.3, fg: 47.5, status: "OK",  contract: "3.2M · 2 ans" },
  ],

  cap: { payroll: 182.4, cap: 140.6, taxLine: 170.8, apron1: 178.1, apron2: 188.9 },

  standings: [
    { rank: 1,  abbr: "BLZ", name: "Blaze",   w: 41, l: 22, pct: ".651", gb: "—",   streak: "W5", mine: true },
    { rank: 2,  abbr: "FRS", name: "Frost",   w: 39, l: 24, pct: ".619", gb: "2.0",  streak: "L1" },
    { rank: 3,  abbr: "STM", name: "Storm",   w: 38, l: 25, pct: ".603", gb: "3.0",  streak: "W3" },
    { rank: 4,  abbr: "QKE", name: "Quake",   w: 36, l: 27, pct: ".571", gb: "5.0",  streak: "W1" },
    { rank: 5,  abbr: "GLC", name: "Glacier", w: 35, l: 28, pct: ".556", gb: "6.0",  streak: "L2" },
    { rank: 6,  abbr: "CMT", name: "Comets",  w: 33, l: 30, pct: ".524", gb: "8.0",  streak: "W2" },
    { rank: 7,  abbr: "TID", name: "Tide",    w: 31, l: 32, pct: ".492", gb: "10.0", streak: "W1" },
    { rank: 8,  abbr: "PLS", name: "Pulse",   w: 30, l: 33, pct: ".476", gb: "11.0", streak: "L1" },
    { rank: 9,  abbr: "RDG", name: "Ridge",   w: 28, l: 35, pct: ".444", gb: "13.0", streak: "L4" },
    { rank: 10, abbr: "DSK", name: "Dusk",    w: 27, l: 36, pct: ".429", gb: "14.0", streak: "L2" },
    { rank: 11, abbr: "MSA", name: "Mesa",    w: 24, l: 39, pct: ".381", gb: "17.0", streak: "L5" },
    { rank: 12, abbr: "HRB", name: "Harbor",  w: 21, l: 42, pct: ".333", gb: "20.0", streak: "W1" },
  ],

  nextGame: { away: { abbr: "FRS", name: "Frost", record: "39-24" }, home: { abbr: "BLZ", name: "Blaze", record: "41-22" }, tipoff: "20:30", day: "Ce soir" },

  live: {
    home: { abbr: "BLZ", record: "41-22" }, away: { abbr: "FRS", record: "39-24" },
    period: "4TH", clock: "02:14", homeScore: 104, awayScore: 96,
    lineScore: { away: [24, 31, 22, 19], home: [30, 28, 29, 17] },
    events: [
      { id: 12, clock: "02:14", period: "Q4", type: "three",    score: "104-96", hot: true,  text: "OKAFOR à 3pts au buzzer de la possession ! 5e panier de suite — il est EN FEU." },
      { id: 11, clock: "02:31", period: "Q4", type: "steal",    score: "101-96", text: "Interception d'Ellison, qui lance la contre-attaque." },
      { id: 10, clock: "02:44", period: "Q4", type: "turnover", score: "99-96",  text: "Perte de balle de Frost sous la pression défensive." },
      { id: 9,  clock: "03:02", period: "Q4", type: "score",    score: "99-96",  text: "Kovač conclut au pied du panier après l'offensive rebound." },
      { id: 8,  clock: "03:20", period: "Q4", type: "foul",     score: "97-96",  text: "Faute offensive sifflée sur Marchetti (Frost)." },
      { id: 7,  clock: "03:38", period: "Q4", type: "block",    score: "97-96",  text: "CONTRE monstrueux de Beaumont sur la pénétration !" },
      { id: 6,  clock: "04:05", period: "Q4", type: "three",    score: "97-96",  text: "Okafor égalise à 3pts. Ambiance de feu à Ashford." },
      { id: 5,  clock: "04:29", period: "Q4", type: "score",    score: "94-96",  text: "Sørensen (Frost) en pull-up à mi-distance." },
    ],
    boxHome: [
      { name: "D. Okafor",   pos: "PG", min: 36, pts: 31, reb: 4,  ast: 9, fg: "11-18", tp: "5-9", pm: 14, hot: true },
      { name: "M. Ellison",  pos: "SG", min: 34, pts: 22, reb: 5,  ast: 3, fg: "8-16",  tp: "3-7", pm: 11 },
      { name: "T. Varga",    pos: "SF", min: 31, pts: 14, reb: 7,  ast: 2, fg: "6-11",  tp: "2-5", pm: 8 },
      { name: "R. Beaumont", pos: "PF", min: 28, pts: 9,  reb: 11, ast: 1, fg: "4-8",   tp: "0-1", pm: -3 },
      { name: "S. Kovač",    pos: "C",  min: 26, pts: 8,  reb: 13, ast: 2, fg: "4-6",   tp: "0-0", pm: 6 },
    ],
    boxAway: [
      { name: "L. Marchetti",pos: "PG", min: 35, pts: 26, reb: 3, ast: 7, fg: "9-19", tp: "4-9", pm: -9 },
      { name: "K. Sørensen", pos: "SG", min: 33, pts: 19, reb: 4, ast: 2, fg: "7-15", tp: "3-8", pm: -6 },
      { name: "A. Dubois",   pos: "SF", min: 30, pts: 12, reb: 6, ast: 3, fg: "5-10", tp: "1-3", pm: -4 },
      { name: "G. Petrov",   pos: "PF", min: 29, pts: 15, reb: 9, ast: 1, fg: "6-11", tp: "0-2", pm: -2 },
      { name: "N. Haddad",   pos: "C",  min: 27, pts: 10, reb: 8, ast: 1, fg: "5-8",  tp: "0-0", pm: -5 },
    ],
  },

  featured: {
    name: "D. Okafor", pos: "PG", number: 3, age: 26, team: "BLZ", ovr: 94,
    contract: "34.2M · 3 ans", status: "OK", onFire: true,
    attributes: [
      { label: "Tir 3pts", value: 91 }, { label: "Passe", value: 88 },
      { label: "Tir 2pts", value: 86 }, { label: "Physique", value: 83 },
      { label: "Défense", value: 74 }, { label: "Rebond", value: 52 },
    ],
    traits: ["Clutch", "Leader", "Iso Scorer", "Franchise"],
    seasonAvg: { gp: 61, pts: 28.4, reb: 4.1, ast: 9.2, stl: 1.6, tp: 41.2, fg: 49.1, min: 35.8 },
    gamelog: [
      { g: "vs FRS", res: "V 118-104", min: 36, pts: 31, reb: 4, ast: 9, tp: "5-9", pm: 14, hot: true },
      { g: "@ STM",  res: "V 112-108", min: 38, pts: 26, reb: 3, ast: 11, tp: "3-7", pm: 6 },
      { g: "vs QKE", res: "V 121-99",  min: 33, pts: 34, reb: 5, ast: 7, tp: "6-10", pm: 22, hot: true },
      { g: "@ GLC",  res: "D 101-107", min: 37, pts: 22, reb: 6, ast: 8, tp: "2-8", pm: -5 },
      { g: "vs CMT", res: "V 115-110", min: 35, pts: 29, reb: 2, ast: 12, tp: "4-6", pm: 9 },
      { g: "@ TID",  res: "V 108-102", min: 34, pts: 24, reb: 4, ast: 6, tp: "3-9", pm: 4 },
      { g: "vs DSK", res: "D 98-104",  min: 36, pts: 19, reb: 5, ast: 5, tp: "1-7", pm: -8 },
      { g: "@ MSA",  res: "V 124-96",  min: 29, pts: 27, reb: 3, ast: 10, tp: "5-8", pm: 18, hot: true },
    ],
    splits: [
      { label: "Domicile", pts: 30.1, tp: 43.5 },
      { label: "Extérieur", pts: 26.7, tp: 38.4 },
      { label: "Clutch (±5, &lt;5min)", pts: 5.2, tp: 47.0 },
    ],
    recent: [
      { away: { abbr: "FRS", score: 104 }, home: { abbr: "BLZ", score: 118 } },
      { away: { abbr: "BLZ", score: 112 }, home: { abbr: "STM", score: 108 } },
      { away: { abbr: "QKE", score: 99 }, home: { abbr: "BLZ", score: 121 } },
    ],
  },
};
