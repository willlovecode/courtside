import { loadPage, textOf } from "../html";

export interface SelectOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface ListedResult {
  /** Null while the Match is only scheduled: it has no match page yet. */
  matchSiteId: string | null;
  homeTeamSiteId: string;
  homeName: string;
  awayTeamSiteId: string;
  awayName: string;
  /** Sets won by each side; null while the Match has not been played. */
  setsHome: number | null;
  setsAway: number | null;
}

export interface ResultsPage {
  campionati: SelectOption[];
  fasi: SelectOption[];
  giornate: SelectOption[];
  results: ListedResult[];
}

function options(page: ReturnType<typeof loadPage>, id: string): SelectOption[] {
  return page(`select#${id} option`)
    .toArray()
    .map((el) => ({
      value: page(el).attr("value") ?? "",
      label: textOf(page(el)),
      selected: page(el).attr("selected") !== undefined,
    }));
}

const idIn = (text: string | undefined, kind: "team" | "match") => new RegExp(`/${kind}/(\\d+)`).exec(text ?? "")?.[1] ?? null;

/**
 * A page of the results section. The site's selectors list the other competitions,
 * phases and rounds; the first table lists the Matches of the selected round in
 * pairs of rows, home team first. A second table with the same id is the standings
 * up to that round and is ignored here.
 */
export function parseResultsPage(html: string): ResultsPage {
  const page = loadPage(html);
  const results: ListedResult[] = [];

  page("table#GareGiornata")
    .first()
    .find("tr.EvenRow, tr.OddRow")
    .each((_, row) => {
      const homeRow = page(row);
      // The home row owns the result cell, which spans both rows.
      const result = homeRow.children("td[rowspan]");
      if (result.length === 0) return;
      const awayRow = homeRow.next();

      const matchSiteId = idIn(result.attr("onclick"), "match");
      const homeTeamSiteId = idIn(homeRow.find("td.risultati-nomesq").attr("onclick"), "team");
      const awayTeamSiteId = idIn(awayRow.find("td.risultati-nomesq").attr("onclick"), "team");
      if (!homeTeamSiteId || !awayTeamSiteId) throw new Error("Result rows without team links");

      // A Match that has not been played shows 0-0 and has no link to a match page.
      const score = matchSiteId ? /^(\d)\s*-\s*(\d)$/.exec(textOf(result)) : null;
      results.push({
        matchSiteId,
        homeTeamSiteId,
        homeName: textOf(homeRow.find("td.risultati-nomesq")),
        awayTeamSiteId,
        awayName: textOf(awayRow.find("td.risultati-nomesq")),
        setsHome: score ? Number(score[1]) : null,
        setsAway: score ? Number(score[2]) : null,
      });
    });

  return {
    campionati: options(page, "Campionato"),
    fasi: options(page, "Fase"),
    giornate: options(page, "Giornata"),
    results,
  };
}

/** Matches linked from a play-off bracket ("Tabellone"), in page order. */
export function parseBracketMatchIds(html: string): string[] {
  const page = loadPage(html);
  const ids: string[] = [];
  page("#Tabellone td.DettaglioRisPO").each((_, el) => {
    const id = idIn(page(el).attr("onclick"), "match");
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

/** The round number of a Giornata option: "11ª Giornata (25/2/2026)" has round "11ª Giornata". */
export function giornataName(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
