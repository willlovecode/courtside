export const leagueId = "superlega";
export const siteOrigin = "https://www.legavolley.it";
export const timeZone = "Europe/Rome";

/** "2025-26" is called Anno=2025 on legavolley.it. */
export function annoOf(seasonLabel: string): number {
  const year = Number(seasonLabel.split("-")[0]);
  if (!Number.isInteger(year)) throw new Error(`Bad Season label: ${seasonLabel}`);
  return year;
}

/**
 * The site's own Club key is the `Squadra=` code in the statistics links of every team
 * and match page (BASTIA is Perugia). It stays the same when the sponsor changes the
 * name and when the site hands out a new team id for the next Season. Lasting names
 * and slugs are kept by hand.
 */
export const clubsByCode: Record<string, { name: string; slug: string }> = {
  "TN-ITAS": { name: "Trentino Volley", slug: "trentino-volley" },
  BASTIA: { name: "Sir Safety Perugia", slug: "perugia" },
  MC: { name: "Lube Civitanova", slug: "lube-civitanova" },
  "MI-POWER": { name: "Allianz Milano", slug: "milano" },
  VRI: { name: "Verona Volley", slug: "verona" },
  MO: { name: "Modena Volley", slug: "modena" },
  PIACENZAYOU: { name: "Volley Piacenza", slug: "piacenza" },
  MIVER: { name: "Vero Volley Monza", slug: "monza" },
  "CIS-VOLLEY": { name: "Cisterna Volley", slug: "cisterna" },
  APG: { name: "Yuasa Battery Grottazzolina", slug: "grottazzolina" },
  PD: { name: "Pallavolo Padova", slug: "padova" },
  CUNEOSPORT: { name: "Cuneo Volley", slug: "cuneo" },
  PRATA: { name: "Prata di Pordenone", slug: "prata" },
};

export function clubForCode(code: string): { name: string; slug: string } {
  const club = clubsByCode[code];
  if (!club) throw new Error(`Club code ${code} is not in clubsByCode; add its lasting name and slug`);
  return club;
}

/** The competitions of a Season are found by name in the Campionato selector, whose ids change every year. */
export const competitionNames = {
  regular: /^Regular Season SuperLega\b/,
  playoffs: /^Play Off SuperLega\b/,
  placement: /^Play Off 5° Posto SuperLega\b/,
} as const;

export const urls = {
  resultsRoot: (anno: number) => `${siteOrigin}/risultati/?Anno=${anno}`,
  results: (anno: number, campionato: string, fase?: string, giornata?: string) =>
    `${siteOrigin}/risultati/?Anno=${anno}&IdCampionato=${campionato}` +
    (fase ? `&IdFase=${fase}` : "") +
    (giornata ? `&IdGiornata=${giornata}` : ""),
  // IdFase=0 is "Fino ad oggi"; without it the page sometimes answers without Club codes or the date.
  standings: (anno: number, campionato: string) => `${siteOrigin}/classifica/?Anno=${anno}&IdCampionato=${campionato}&IdFase=0`,
  team: (teamId: string) => `${siteOrigin}/team/${teamId}`,
  match: (matchId: string) => `${siteOrigin}/match/${matchId}`,
  player: (key: string) => `${siteOrigin}/player/${key}`,
};

/** Page kinds, used as snapshot folder names. */
export const pageKinds = {
  resultsRoot: "results-root",
  results: "results",
  bracket: "bracket",
  standings: "standings",
  team: "team",
  match: "match",
  player: "player",
} as const;
