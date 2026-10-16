import { loadPage } from "../html";
import { competitionNames } from "./config";
import { parseBracketMatchIds, parseResultsPage, type ResultsPage } from "./resultsPage";

/**
 * Link readers for the fetch step. They only find which page to download next
 * and never interpret what a page says.
 */

export { parseBracketMatchIds as matchIdsOnBracket, parseResultsPage as readResultsLinks };

export interface Competitions {
  regular: string | null;
  playoffs: string | null;
  placement: string | null;
}

/** The ids of the Season's SuperLega competitions, found by their names in the Campionato selector. */
export function competitionsOf(results: ResultsPage): Competitions {
  const find = (pattern: RegExp) => results.campionati.find((o) => pattern.test(o.label))?.value ?? null;
  return {
    regular: find(competitionNames.regular),
    playoffs: find(competitionNames.playoffs),
    placement: find(competitionNames.placement),
  };
}

/** Keys of the Players linked from a team page's Roster. */
export function playerKeysOnTeamPage(html: string): string[] {
  const page = loadPage(html);
  const keys = new Set<string>();
  page("table#roster a[href*='/player/']").each((_, el) => {
    const key = /\/player\/([^/?#]+)/.exec(page(el).attr("href") ?? "")?.[1];
    if (key) keys.add(key);
  });
  return [...keys];
}

/** Keys of the Players listed in a match page's Box scores. */
export function playerKeysOnMatchPage(html: string): string[] {
  const page = loadPage(html);
  const keys = new Set<string>();
  page("td[onclick*='Atleta=']").each((_, el) => {
    const key = /[?&;]Atleta=([^&']+)/.exec(page(el).attr("onclick") ?? "")?.[1];
    if (key) keys.add(key);
  });
  return [...keys];
}
