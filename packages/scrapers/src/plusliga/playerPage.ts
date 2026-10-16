import { idFromHref, loadPage, parseNumber, textOf, type Nodes, type Page } from "./html";

export interface HistoryRow {
  /** "26.09.2025" */
  from: string;
  to: string;
  position: string;
  shirtNumber: number | null;
  clubSiteId: string;
  tour: number;
}

/** One row of the per-Match table, with the site's own column labels. */
export interface PlayerMatchRow {
  matchSiteId: string;
  /** The Player's own Team comes first in "Team A - Team B", whichever side is at home. */
  teamName: string;
  opponentName: string;
  /** Keyed by "<group> <column>", e.g. "Atak Pkt"; the first two columns have no group. Dashes are null. */
  stats: Record<string, number | null>;
}

export interface PlayerPage {
  name: string;
  /** The Season the page shows, as in the page title: "Sezon 2025/2026". */
  seasonLabel: string | null;
  birthDate: string | null;
  position: string | null;
  heightCm: number | null;
  history: HistoryRow[];
  matchRows: PlayerMatchRow[];
}

function parseBio(page: Page): Map<string, string> {
  const bio = new Map<string, string>();
  page(".player-page-grid-main .number").each((_, el) => {
    const node = page(el);
    const value = textOf(node.find("h3").first());
    const label = textOf(node).replace(value, "").trim();
    if (label.endsWith(":") && value) bio.set(label, value);
  });
  return bio;
}

function parseHistory(page: Page): HistoryRow[] {
  const rows: HistoryRow[] = [];
  const table = page("table")
    .filter((_, t) => textOf(page(t).find("thead th").first()) === "data od")
    .first();
  table.find("tbody tr").each((_, row) => {
    const cells = page(row).children("td");
    const link = cells.eq(4).find("a").first();
    const href = link.attr("href") ?? "";
    const clubSiteId = idFromHref(href, "teams");
    const tour = /\/tour\/(\d+)/.exec(href)?.[1];
    if (!clubSiteId || !tour) return;
    rows.push({
      from: textOf(cells.eq(0)),
      to: textOf(cells.eq(1)),
      position: textOf(cells.eq(2)),
      shirtNumber: parseNumber(textOf(cells.eq(3))),
      clubSiteId,
      tour: Number(tour),
    });
  });
  return rows;
}

/** Column labels from the two header rows: group cells span columns, the second row names them. */
function columnLabels(page: Page, table: Nodes): string[] {
  const [groupRow, columnRow] = table.find("thead tr").toArray();
  if (!groupRow || !columnRow) throw new Error("Per-Match table without two header rows");
  const groups: string[] = [];
  page(groupRow)
    .children("th")
    .each((_, th) => {
      const span = Number(page(th).attr("colspan") ?? 1);
      for (let i = 0; i < span; i++) groups.push(textOf(page(th)));
    });
  return page(columnRow)
    .children("th")
    .toArray()
    .map((th, i) => {
      const column = textOf(page(th));
      // This table spells the group "Przyjecie", without the diacritic.
      const group = (groups[i] ?? "").replace("Przyjecie", "Przyjęcie");
      // "Inne" only means "other"; Obrona and Asysta stand for themselves.
      return group && group !== "Inne" ? `${group} ${column}` : column;
    });
}

function parseMatchRows(page: Page): PlayerMatchRow[] {
  const table = page("table")
    .filter((_, t) => page(t).find("thead th").toArray().some((th) => textOf(page(th)) === "Bilans"))
    .first();
  if (table.length === 0) return [];
  const labels = columnLabels(page, table);

  const rows: PlayerMatchRow[] = [];
  table.find("tbody tr").each((_, row) => {
    const cells = page(row).children("td");
    const link = cells.eq(0).find("a").first();
    const matchSiteId = idFromHref(link.attr("href"), "games");
    // The totals and averages rows at the bottom have no link.
    if (!matchSiteId) return;

    // The link text reads "Own Team -<br>Opponent".
    const names: string[] = [""];
    link.contents().each((_, node) => {
      if (node.type === "tag" && node.name === "br") names.push("");
      else names[names.length - 1] += page(node).text();
    });
    const [own = "", opponent = ""] = names.map((n) => n.replace(/\s+/g, " ").trim());

    const stats: Record<string, number | null> = {};
    labels.forEach((label, i) => {
      if (i === 0) return;
      stats[label] = parseNumber(textOf(cells.eq(i)));
    });
    rows.push({
      matchSiteId,
      teamName: own.replace(/\s*-$/, ""),
      opponentName: opponent,
      stats,
    });
  });
  return rows;
}

export function parsePlayerPage(html: string): PlayerPage {
  const page = loadPage(html);
  const bio = parseBio(page);
  return {
    name: textOf(page(".player-page-grid-main h1").first()),
    seasonLabel: /Sezon \d{4}\/\d{4}/.exec(textOf(page("title")))?.[0] ?? null,
    birthDate: bio.get("Data urodzenia:") ?? null,
    position: bio.get("Pozycja:") ?? null,
    heightCm: parseNumber(bio.get("Wzrost:") ?? ""),
    history: parseHistory(page),
    matchRows: parseMatchRows(page),
  };
}
