export const leagueId = "plusliga";
export const siteOrigin = "https://www.tauronliga.pl";
export const timeZone = "Europe/Warsaw";

/** tauronliga.pl numbers every Season as a "tour". 2026-27 is found through the Season selector on a team page. */
export const knownTours: Record<string, number> = { "2025-26": 52 };

/** How the Season selector writes a Season: "2026-27" becomes "Sezon 2026/2027". */
export function seasonLabelOnSite(seasonLabel: string): string {
  const [start, end] = seasonLabel.split("-");
  if (!start || !end) throw new Error(`Bad Season label: ${seasonLabel}`);
  return `Sezon ${start}/${start.slice(0, 2)}${end}`;
}

/**
 * Lasting names of the Clubs, keyed by the site's team id. The site shows
 * sponsor names that change from Season to Season, so slugs come from here.
 */
export const clubsBySiteId: Record<string, { name: string; slug: string }> = {
  "2": { name: "Warta Zawiercie", slug: "warta-zawiercie" },
  "3": { name: "Resovia Rzeszów", slug: "resovia-rzeszow" },
  "8": { name: "Barkom Każany Lwów", slug: "barkom-kazany-lwow" },
  "18": { name: "GKS Katowice", slug: "gks-katowice" },
  "21": { name: "ZAKSA Kędzierzyn-Koźle", slug: "zaksa-kedzierzyn-kozle" },
  "24": { name: "AZS Olsztyn", slug: "azs-olsztyn" },
  "26": { name: "Jastrzębski Węgiel", slug: "jastrzebski-wegiel" },
  "28": { name: "Stilon Gorzów", slug: "stilon-gorzow" },
  "45": { name: "LUK Lublin", slug: "luk-lublin" },
  "56": { name: "Ślepsk Suwałki", slug: "slepsk-suwalki" },
  "61": { name: "Skra Bełchatów", slug: "skra-belchatow" },
  "62": { name: "Projekt Warszawa", slug: "projekt-warszawa" },
  "71": { name: "Norwid Częstochowa", slug: "norwid-czestochowa" },
  "78": { name: "Trefl Gdańsk", slug: "trefl-gdansk" },
  "93": { name: "ChKS Chełm", slug: "chks-chelm" },
};

export function clubForSiteId(siteId: string): { name: string; slug: string } {
  const club = clubsBySiteId[siteId];
  if (!club) throw new Error(`Club ${siteId} is not in clubsBySiteId; add its lasting name and slug`);
  return club;
}

export const urls = {
  matchList: (tour: number) => `${siteOrigin}/games/tour/${tour}/nocookies/1.html`,
  standings: (tour: number) => `${siteOrigin}/table/tour/${tour}/nocookies/1.html`,
  teamIndex: (tour: number) => `${siteOrigin}/teams/tour/${tour}/nocookies/1.html`,
  team: (tour: number, teamId: string) => `${siteOrigin}/teams/tour/${tour}/id/${teamId}/nocookies/1.html`,
  match: (tour: number, matchId: string) => `${siteOrigin}/games/action/show/id/${matchId}/tour/${tour}/nocookies/1.html`,
  player: (tour: number, playerId: string) => `${siteOrigin}/players/id/${playerId}/tour/${tour}/nocookies/1.html`,
};

/** Pages a visitor would open, without the cookie-bypass segment. These go into source_refs. */
export const publicUrls = {
  standings: (tour: number) => `${siteOrigin}/table/tour/${tour}.html`,
  club: (teamId: string) => `${siteOrigin}/teams/id/${teamId}.html`,
  team: (tour: number, teamId: string) => `${siteOrigin}/teams/id/${teamId}/tour/${tour}.html`,
  match: (tour: number, matchId: string) => `${siteOrigin}/games/action/show/id/${matchId}/tour/${tour}.html`,
  player: (tour: number, playerId: string) => `${siteOrigin}/players/id/${playerId}/tour/${tour}.html`,
};

/** Page kinds, used as snapshot folder names. */
export const pageKinds = {
  matchList: "matchlist",
  standings: "standings",
  teamIndex: "teams",
  team: "team",
  match: "match",
  player: "player",
} as const;
