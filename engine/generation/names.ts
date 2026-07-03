/**
 * Pools de noms procéduraux FBL — CLAUDE.md "Anonymisation obligatoire" :
 * aucun nom réel de joueur ou d'équipe NBA. Exception assumée (voir CLAUDE.md
 * "Exception villes") : la FBL est une ligue mondiale, les marchés des
 * franchises et les origines des joueurs sont de vraies villes ; seuls les
 * noms de joueurs et les surnoms d'équipe restent fictifs.
 *
 * `NAME_REGIONS` groupe prénoms/noms de famille/villes d'origine par région
 * du monde : un joueur est généré à partir d'**une seule région tirée au
 * sort**, pour que son nom soit cohérent avec son origine (spec-player-model
 * §1 — `origin` est narratif, mais doit rester crédible).
 */

export interface NameRegion {
  id: string;
  firstNames: readonly string[];
  lastNames: readonly string[];
  /** Villes d'origine réelles associées à cette région, distinctes des marchés de franchise. */
  origins: readonly string[];
}

export const NAME_REGIONS: readonly NameRegion[] = [
  {
    id: "WEST_EUROPE_NORTH_AMERICA",
    firstNames: [
      "Darnel", "Ronan", "Tobias", "Jaren", "Nico", "Iker", "Bram", "Milo",
      "Ezra", "Tanner", "Oskar", "Yannick", "Corin", "Devan", "Anton", "Silas",
      "Marek", "Théo", "Adrien", "Boris", "Cassius", "Django", "Enzo", "Fenn",
      "Garan", "Hugo", "Ivo", "Jaric", "Kian", "Lasse", "Moro", "Nael",
      "Mattis", "Joaquim", "Rutger", "Emil", "Sander", "Viggo", "Alaric", "Bastien",
      "Corentin", "Damien", "Elian", "Florin", "Gaspard", "Renard", "Soren", "Tybalt",
    ],
    lastNames: [
      "Verhoeven", "Bracco", "Kowalski", "Reyer", "Solberg", "Castellano", "Hurel",
      "Yilmaz", "Novak", "Duarte", "Faucher", "Renner", "Delacroix", "Bergman",
      "Vasquez", "Lindqvist", "Marchetti", "Costin", "Braxton", "Sandoval", "Krantz",
      "Beaulieu", "Rosseau", "Thorne", "Vandal", "Marchand", "Ashworth", "Halvorsen",
      "Cadence", "Brantley", "Domingo", "Fasano", "Grewal", "Hollis", "Imbert",
      "Jarrah", "Kessler", "Loncar", "Marlowe", "Nightingale", "Oduya", "Pemberton",
      "Quesnel", "Rutherford", "Steinberg", "Underhill", "Vanterpool", "Whitlock",
    ],
    origins: [
      "Lyon", "Marseille", "Barcelone", "Milan", "Munich", "Amsterdam", "Vienne",
      "Athènes", "Lisbonne", "Dublin", "Zurich", "Bruxelles",
      "Montréal", "Vancouver", "Houston", "Miami", "Atlanta", "Seattle", "Denver",
      "Boston", "Philadelphie", "La Nouvelle-Orléans",
    ],
  },
  {
    id: "NORDIC_SLAVIC",
    firstNames: [
      "Stold", "Ansgar", "Bjorn", "Erik", "Finnegan", "Gustaf", "Havard", "Ivar",
      "Jorund", "Kalle", "Magnus", "Nils", "Olaf", "Pyotr", "Radomir", "Stanislav",
      "Ulf", "Viktor", "Wenzel", "Dragan", "Milos", "Vaclav",
    ],
    lastNames: [
      "Aoki", "Petrov", "Novikov", "Sokolov", "Herrera", "Jankovic", "Kaczmarek",
      "Lehtonen", "Mikkelsen", "Nowak", "Orlov", "Petrescu", "Ristic", "Sorensen",
      "Turek", "Volkov", "Wisniewski", "Zielinski",
    ],
    origins: ["Varsovie", "Stockholm", "Helsinki", "Oslo", "Copenhague", "Prague", "Budapest", "Belgrade"],
  },
  {
    id: "LATIN_AMERICA",
    firstNames: [
      "Mateus", "Rafi", "Emiliano", "Thiago", "Bruno", "Diego", "Rodrigo", "Santiago",
      "Mauricio", "Andres", "Felipe", "Gustavo", "Leonel", "Osvaldo", "Ramiro", "Tomas",
      "Valentin", "Kaïo", "Petro", "Nando",
    ],
    lastNames: [
      "Vasconcelos", "Aguirre", "Bautista", "Cordero", "Delgado", "Escobar",
      "Figueroa", "Guerrero", "Henriquez", "Ibarra", "Jimenez", "Lozano",
      "Montoya", "Navarro", "Ochoa", "Paredes", "Quinones", "Riquelme", "Salcedo",
      "Tinoco", "Urrutia", "Villalobos", "Zambrano",
    ],
    origins: [
      "Medellín", "Santiago", "Quito", "Montevideo", "Caracas", "Recife",
      "Fortaleza", "La Paz", "Asunción", "Cali", "Guadalajara", "Monterrey",
    ],
  },
  {
    id: "AFRICA",
    firstNames: [
      "Kwame", "Emeka", "Owusu", "Kofi", "Chidi", "Kwabena", "Tendai", "Sipho",
      "Themba", "Amadou", "Boubacar", "Kojo", "Nnamdi", "Obinna", "Sekou", "Yaw",
      "Zola", "Adisa", "Bakari", "Chike", "Malick", "Hakim", "Denzo",
    ],
    lastNames: [
      "Osei", "Ndiaye", "Mbeki", "Okafor", "Sowande", "Iwu", "Onyekachi",
      "Ekwueme", "Mbappe-Simo", "Adeyemi", "Boateng", "Diallo", "Kamau", "Mensah",
      "Nwosu", "Okonkwo", "Toure", "Zuma", "Abara", "Chukwu", "Fofana", "Kanu",
    ],
    origins: [
      "Dakar", "Accra", "Abidjan", "Addis-Abeba", "Kampala", "Dar es Salaam",
      "Tunis", "Alger", "Rabat", "Kigali", "Douala", "Maputo",
    ],
  },
  {
    id: "SOUTH_ASIA_MIDDLE_EAST",
    firstNames: [
      "Farid", "Arjun", "Aryan", "Dev", "Ishaan", "Kabir", "Nikhil", "Rohan",
      "Sameer", "Tariq", "Vikram", "Zaid", "Emre", "Kerem", "Baran", "Cem",
      "Onur", "Selim", "Tolga", "Yusuf", "Idris", "Karim", "Rashid", "Samir",
    ],
    lastNames: [
      "Khoury", "Haddad", "Nasser", "Qureshi", "Rahman", "Sharma", "Malhotra",
      "Chatterjee", "Iyer", "Rao", "Yalcin", "Demir", "Aydin", "Celik", "Sahin",
    ],
    origins: [
      "Delhi", "Bangalore", "Chennai", "Karachi", "Dacca", "Colombo",
      "Dubaï", "Doha", "Riyad", "Amman", "Beyrouth", "Téhéran",
    ],
  },
  {
    id: "EAST_ASIA",
    firstNames: [
      "Renji", "Haruto", "Kaito", "Riku", "Sora", "Taiga", "Yuto", "Jin",
      "Minho", "Seojoon", "Taeyang", "Wei", "Hao", "Jian", "Long", "Ren", "Kenji",
    ],
    lastNames: [
      "Tanaka", "Sung", "Nakamura", "Watanabe", "Yamada", "Kobayashi", "Suzuki",
      "Kimura", "Park", "Choi", "Jung", "Kang", "Wong", "Chen", "Liu", "Zhang",
      "Huang", "Lin",
    ],
    origins: [
      "Osaka", "Kyoto", "Pékin", "Guangzhou", "Shenzhen", "Bangkok", "Hanoï",
      "Manille", "Kuala Lumpur", "Singapour", "Taipei", "Busan",
    ],
  },
  {
    id: "OCEANIA",
    firstNames: ["Kahu", "Manaia", "Nikau", "Rangi", "Tane", "Wiremu", "Kaleo", "Makoa", "Tavita"],
    lastNames: ["Tamati", "Ngata", "Ropata", "Faleolo", "Tuilagi", "Manu"],
    origins: ["Christchurch", "Wellington", "Suva", "Port Moresby"],
  },
] as const;

/** Surnoms d'équipe fictifs, en anglais, jamais un nom NBA réel. */
export const TEAM_NICKNAMES: readonly string[] = [
  "Comets", "Embers", "Storm", "Cyclones", "Sparks",
  "Wolves", "Voltage", "Tides", "Falcons", "Vortex",
  "Flames", "Bison", "Eagles", "Quakes", "Lynx",
  "Tornadoes", "Sentinels", "Braziers", "Nova", "Squalls",
  "Pumas", "Eclipse", "Rams", "Ashes", "Cheetahs",
  "Titans", "Aurora", "Blaze", "Surge", "Meteors",
] as const;

export const CONFERENCES: readonly [string, string] = ["Conférence Nord", "Conférence Sud"];

/**
 * Ligue mondiale : conférences = hémisphères, divisions = continents.
 * Villes réelles (voir CLAUDE.md "Exception villes") — 5 grandes métropoles
 * par continent, combinées à un surnom fictif pour former le nom d'équipe.
 */
export const DIVISIONS: readonly {
  name: string;
  conference: string;
  cities: readonly string[];
}[] = [
  {
    name: "Amérique du Nord",
    conference: "Conférence Nord",
    cities: ["New York", "Los Angeles", "Toronto", "Mexico", "Chicago"],
  },
  {
    name: "Europe",
    conference: "Conférence Nord",
    cities: ["Paris", "Londres", "Berlin", "Madrid", "Istanbul"],
  },
  {
    name: "Asie",
    conference: "Conférence Nord",
    cities: ["Tokyo", "Shanghai", "Mumbai", "Séoul", "Jakarta"],
  },
  {
    name: "Amérique du Sud",
    conference: "Conférence Sud",
    cities: ["São Paulo", "Buenos Aires", "Rio de Janeiro", "Bogotá", "Lima"],
  },
  {
    name: "Afrique",
    conference: "Conférence Sud",
    cities: ["Lagos", "Le Caire", "Johannesburg", "Nairobi", "Casablanca"],
  },
  {
    name: "Océanie",
    conference: "Conférence Sud",
    cities: ["Sydney", "Melbourne", "Auckland", "Brisbane", "Perth"],
  },
];
