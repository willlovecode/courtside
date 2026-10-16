import { loadPage, textOf } from "../html";
import { parseCell } from "./matchPage";

export interface ListedStanding {
  position: number;
  /** The Club key, from the statistics link of the row. */
  code: string | null;
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

/** The "Classifica" page: one row per Team, in table order, after the last played round. */
export function parseStandings(html: string): ListedStanding[] {
  const page = loadPage(html);
  const rows: ListedStanding[] = [];
  page("table#GareGiornata tr#EvenRow, table#GareGiornata tr#OddRow").each((_, row) => {
    const cells = page(row).children("td");
    const value = (i: number) => {
      const n = parseCell(textOf(cells.eq(i)));
      if (n === null) throw new Error(`Empty Standing cell ${i}`);
      return n;
    };
    // Cells: Team, Punti, Giocate, Vinte, Perse, six result types, Set vinti/persi, Punti fatti/subiti, two ratios, Squal.
    rows.push({
      position: Number(textOf(cells.eq(0).find(".pos"))),
      code: /[?&;]Squadra=([^&']+)/.exec(cells.eq(0).attr("onclick") ?? "")?.[1] ?? null,
      name: textOf(cells.eq(0).clone().find(".pos").remove().end()),
      tablePoints: value(1),
      played: value(2),
      won: value(3),
      lost: value(4),
      setsWon: value(11),
      setsLost: value(12),
      pointsWon: value(13),
      pointsLost: value(14),
    });
  });
  return rows;
}
