import { idFromHref, loadPage, parseNumber, textOf } from "./html";

export interface SeasonLink {
  /** As written by the selector, e.g. "Sezon 2026/2027". */
  label: string;
  tour: number;
}

export interface RosterRow {
  playerSiteId: string;
  name: string;
  shirtNumber: number | null;
  /** In Polish, e.g. "Przyjmujący". */
  position: string;
}

export interface TeamPage {
  /** The Team name for the page's Season, sponsor included. */
  name: string;
  logoUrl: string | null;
  roster: RosterRow[];
  seasonLinks: SeasonLink[];
}

export function parseSeasonLinks(html: string): SeasonLink[] {
  const $ = loadPage(html);
  const links = new Map<number, SeasonLink>();
  $("a[href*='/tour/']").each((_, el) => {
    const label = textOf($(el));
    const tour = /\/tour\/(\d+)\//.exec($(el).attr("href") ?? "")?.[1];
    if (/^Sezon \d{4}\/\d{4}$/.test(label) && tour) links.set(Number(tour), { label, tour: Number(tour) });
  });
  return [...links.values()];
}

export function parseTeamPage(html: string): TeamPage {
  const $ = loadPage(html);
  const roster: RosterRow[] = [];
  $("#playerslist tbody tr").each((_, row) => {
    const cells = $(row).children("td");
    const link = cells.eq(1).find("a").first();
    const playerSiteId = idFromHref(link.attr("href"), "players");
    if (!playerSiteId) return;
    roster.push({
      playerSiteId,
      name: textOf(link),
      shirtNumber: parseNumber(textOf(cells.eq(0))),
      position: textOf(cells.eq(2)),
    });
  });

  const logo = $(".team-photo-box .logo img").first().attr("src");
  return {
    name: textOf($(".team-photo-box h1").first()),
    logoUrl: logo ?? null,
    roster,
    seasonLinks: parseSeasonLinks(html),
  };
}

/** Team ids linked from a Season's team overview page. */
export function parseTeamIndex(html: string): string[] {
  const $ = loadPage(html);
  const ids = new Set<string>();
  $("article.team-box a[href*='/teams/id/']").each((_, el) => {
    const id = idFromHref($(el).attr("href"), "teams");
    if (id) ids.add(id);
  });
  return [...ids];
}
