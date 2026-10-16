import { idFromHref, loadPage } from "./html";

/**
 * Link readers for the fetch step. They only find which page to download next
 * and never interpret what a page says.
 */

function idsFrom(html: string, selector: string, section: "games" | "players"): string[] {
  const $ = loadPage(html);
  const ids = new Set<string>();
  $(selector).each((_, el) => {
    const id = idFromHref($(el).attr("href"), section);
    if (id) ids.add(id);
  });
  return [...ids];
}

export const matchIdsOnList = (html: string) => idsFrom(html, "section.ajax-synced-games[data-team] a[href*='/games/action/show/id/']", "games");

export const playerIdsOnTeamPage = (html: string) => idsFrom(html, "#playerslist a[href*='/players/id/']", "players");

export const playerIdsOnMatchPage = (html: string) => idsFrom(html, "a[href*='/players/id/']", "players");
