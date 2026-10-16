import { loadPage, textOf } from "../html";
import { parseCell } from "./matchPage";

export interface RosterRow {
  playerKey: string;
  /** "SURNAME Name", surname in capitals, as the Roster writes it. */
  name: string;
  shirtNumber: number | null;
  /** In Italian, e.g. "Schiacciatore". */
  role: string;
}

export interface TeamPage {
  /** The Season's Team name, sponsor included. */
  name: string;
  /** The Club key, from the Squadra= parameter of the statistics links. */
  code: string | null;
  logoUrl: string | null;
  roster: RosterRow[];
}

export function parseTeamPage(html: string): TeamPage {
  const page = loadPage(html);

  // The first statistics link of the page belongs to this Team.
  const statsHref = page("a[href*='Statistiche_i.asp'][href*='Squadra=']").first().attr("href") ?? "";
  const code = /[?&]Squadra=([^&]+)/.exec(statsHref)?.[1] ?? null;

  const roster: RosterRow[] = [];
  page("table#roster tbody tr").each((_, row) => {
    const cells = page(row).children("td");
    const link = cells.filter(".nome").find("a").first();
    const playerKey = /\/player\/([^/?#]+)/.exec(link.attr("href") ?? "")?.[1];
    if (!playerKey) return;
    roster.push({
      playerKey,
      name: textOf(link),
      shirtNumber: parseCell(textOf(cells.filter(".num-maglia"))),
      role: textOf(cells.filter(".ruolo")),
    });
  });

  return {
    name: textOf(page("title")),
    code,
    logoUrl: page(".logo-sq img").first().attr("src") ?? null,
    roster,
  };
}
