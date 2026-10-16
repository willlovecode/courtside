import { idFromHref, loadPage, parseNumber, textOf } from "./html";

export interface ListedStanding {
  position: number;
  clubSiteId: string;
  name: string;
  tablePoints: number;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}

/**
 * The page holds one table per Round, each row tagged `data-termin="1-1-<round>"`.
 * The table after the last Round is the final regular-season Standing.
 */
export function parseFinalStandings(html: string): ListedStanding[] {
  const $ = loadPage(html);
  const rows = $("table.rs-standings-table tbody tr[data-termin]").toArray();
  const roundOf = (termin: string) => Number(termin.split("-").at(-1));
  const lastRound = Math.max(...rows.map((r) => roundOf($(r).attr("data-termin") ?? "")));

  return rows
    .filter((r) => roundOf($(r).attr("data-termin") ?? "") === lastRound)
    .map((r) => {
      const cells = $(r).children("td");
      const value = (i: number) => {
        const n = parseNumber(textOf(cells.eq(i)));
        if (n === null) throw new Error(`Empty Standing cell ${i}`);
        return n;
      };
      const clubSiteId = idFromHref(cells.eq(1).find("a").attr("href"), "teams");
      if (!clubSiteId) throw new Error("Standing row without a team link");
      return {
        position: value(0),
        clubSiteId,
        name: textOf(cells.eq(1)),
        tablePoints: value(2),
        played: value(3),
        won: value(4),
        lost: value(5),
        setsWon: value(6),
        setsLost: value(7),
        pointsWon: value(8),
        pointsLost: value(9),
      };
    });
}
