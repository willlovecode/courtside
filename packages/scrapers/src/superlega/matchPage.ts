import { loadPage, textOf, type Nodes, type Page } from "../html";

export interface MatchPageTeam {
  /** The site's Club key, from the `Squadra=` statistics link. */
  code: string;
  name: string;
  setsWon: number | null;
}

export interface PageSet {
  setNumber: number;
  durationMinutes: number | null;
  homePoints: number;
  awayPoints: number;
}

export interface BoxScoreRow {
  playerKey: string;
  /** "Surname Name" as the site writes it, without the "(L)" libero mark. */
  name: string;
  shirtNumber: number | null;
  /** The five SET cells: the rotation slot the Player started in, "*" for a substitute, null if not on court. */
  setCells: (number | string | null)[];
  /** Every other column keyed "<group> <column>", e.g. "Attacco Pt". Dots are null. */
  stats: Record<string, number | null>;
}

export interface TeamBoxScore {
  teamName: string;
  rows: BoxScoreRow[];
  /** The "Totali squadra" points. */
  totalPoints: number | null;
}

export interface MatchPage {
  season: string | null;
  competition: string | null;
  /** The stage as the header writes it: "11ª Giornata Ritorno" or "Gara 1 Quarti". */
  stage: string | null;
  matchNumber: string | null;
  home: MatchPageTeam;
  away: MatchPageTeam;
  /** "25/2/2026" and "20:30", Europe/Rome. */
  date: string | null;
  time: string | null;
  attendance: number | null;
  venueName: string | null;
  venueCity: string | null;
  mvp: { playerKey: string; name: string } | null;
  sets: PageSet[];
  boxScores: TeamBoxScore[];
}

const statColumns = [
  "Punti Tot",
  "Punti BP",
  "Punti VP",
  "Battuta Tot",
  "Battuta Err",
  "Battuta Pt",
  "Ricezione Tot",
  "Ricezione Err",
  "Ricezione Pos%",
  "Ricezione Prf%",
  "Attacco Tot",
  "Attacco Err",
  "Attacco Mur",
  "Attacco Pt",
  "Attacco Pt%",
  "Muro Pt",
] as const;

/** What the second header row says, so a layout change is noticed instead of misread. */
const expectedSubHeaders = ["1", "2", "3", "4", "5", "Tot", "BP", "VP", "", "Err", "Pt", "", "Err", "Pos%", "Prf%", "", "Err", "Mur", "Pt", "Pt%", "Pt"];

/** "3.293" is 3293; "47%" is 47; a dot or blank means nothing was recorded. */
export function parseCell(raw: string): number | null {
  const text = raw.replace(/\s+/g, "").replace("%", "");
  if (text === "" || text === "." || text === "-") return null;
  if (!/^-?\d+$/.test(text.replace(/\./g, ""))) throw new Error(`Not a number: "${raw}"`);
  return Number(text.replace(/\./g, ""));
}

const attribute = (el: Nodes, name: string) => el.attr(name) ?? "";
const queryParam = (text: string, name: string) => new RegExp(`[?&;]${name}=([^&';]*)`).exec(text)?.[1] ?? null;

function parseTeams(page: Page): [MatchPageTeam, MatchPageTeam] {
  const header = page("table#Tabellino").first();
  const rows = header.find("tr").toArray().slice(1, 3);
  const teams = rows.map((row) => {
    const cell = page(row).find("td.DettaglioA");
    const code = queryParam(attribute(cell, "onclick"), "Squadra");
    if (!code) throw new Error("Match page team without a Squadra code");
    const score = textOf(page(row).find("td#HighCol"));
    return { code, name: textOf(cell), setsWon: /^\d$/.test(score) ? Number(score) : null };
  });
  if (teams.length !== 2 || !teams[0] || !teams[1]) throw new Error("Match page without two teams");
  return [teams[0], teams[1]];
}

function parseFacts(page: Page) {
  const facts = page("table#Tabellino").filter((_, t) => textOf(page(t).find("th").first()) === "Data").first();
  const labels = facts.find("th").toArray().map((th) => textOf(page(th)));
  const valueRow = facts.find("tr").eq(1).children("td");
  const header: Record<string, string> = {};
  labels.forEach((label, i) => (header[label] = textOf(valueRow.eq(i))));

  const rows = new Map<string, Nodes>();
  facts.find("tr").each((_, row) => {
    const label = textOf(page(row).children("td.HeadCol").first());
    if (label) rows.set(label, page(row).children("td").slice(1));
  });
  return { header, rows };
}

function parseSets(page: Page): PageSet[] {
  const table = page("table#Tabellino").filter((_, t) => textOf(page(t).find("th").first()) === "Set").first();
  const sets: PageSet[] = [];
  table.find("tr").each((_, row) => {
    const cells = page(row).children("td");
    if (cells.length < 6 || !/^\d$/.test(textOf(cells.eq(0)))) return;
    const final = /^(\d+)-(\d+)$/.exec(textOf(cells.eq(5)));
    // Sets that were not played show 0-0.
    if (!final || (final[1] === "0" && final[2] === "0")) return;
    const duration = /^(\d+)'$/.exec(textOf(cells.eq(1)));
    sets.push({
      setNumber: Number(textOf(cells.eq(0))),
      durationMinutes: duration ? Number(duration[1]) : null,
      homePoints: Number(final[1]),
      awayPoints: Number(final[2]),
    });
  });
  return sets;
}

function parseBoxScore(page: Page, table: Nodes): TeamBoxScore {
  const rows = table.find("tr").toArray();
  const subHeaders = page(rows[1]).children("td, th").toArray().slice(1).map((c) => textOf(page(c)));
  if (subHeaders.join("|") !== expectedSubHeaders.join("|")) {
    throw new Error(`Box score columns changed: ${subHeaders.join(" ")}`);
  }

  const players: BoxScoreRow[] = [];
  let totalPoints: number | null = null;
  for (const row of rows.slice(2)) {
    const cells = page(row).children("td");
    const first = textOf(cells.eq(0));
    if (first === "Totali squadra") {
      totalPoints = parseCell(textOf(cells.eq(1)));
      continue;
    }
    const playerKey = queryParam(attribute(cells.eq(1), "onclick"), "Atleta");
    if (!playerKey) continue;
    if (cells.length !== 2 + 6 + statColumns.length) throw new Error(`Box score row of ${playerKey} has ${cells.length} cells`);

    const stats: Record<string, number | null> = { Voto: parseCell(textOf(cells.eq(2))) };
    statColumns.forEach((label, i) => (stats[label] = parseCell(textOf(cells.eq(8 + i)))));
    players.push({
      playerKey,
      name: textOf(cells.eq(1)).replace(/\s*\(L\)$/, ""),
      shirtNumber: parseCell(first),
      setCells: [3, 4, 5, 6, 7].map((i) => {
        const text = textOf(cells.eq(i));
        if (text === "") return null;
        return text === "*" ? "*" : Number(text);
      }),
      stats,
    });
  }
  return { teamName: textOf(page(rows[0]).children("td").first()), rows: players, totalPoints };
}

export function parseMatchPage(html: string): MatchPage {
  const page = loadPage(html);
  const [home, away] = parseTeams(page);
  const { header, rows } = parseFacts(page);

  const parts = textOf(page("table#Tabellino").first().find("th").first()).split(" - ");
  const mvpCell = rows.get("Nomination MVP");
  const mvpKey = queryParam(attribute(mvpCell?.first() ?? page(""), "onclick"), "Atleta");
  const city = rows.get("Città");

  return {
    season: /\d{4}\/\d{4}/.exec(parts[0] ?? "")?.[0] ?? null,
    competition: parts[1] ?? null,
    stage: parts[2] ?? null,
    matchNumber: /Gara n°(\d+)/.exec(parts[3] ?? "")?.[1] ?? null,
    home,
    away,
    date: header["Data"] || null,
    time: header["Ora"] || null,
    attendance: parseCell(header["Spettatori"] ?? ""),
    venueName: (rows.get("Impianto") && textOf(rows.get("Impianto") as Nodes)) || null,
    venueCity: (city && textOf(city.first())) || null,
    mvp: mvpKey && mvpCell ? { playerKey: mvpKey, name: textOf(mvpCell.first()) } : null,
    sets: parseSets(page),
    boxScores: page("table#Tabellino")
      .filter((_, t) => page(t).find("th").toArray().some((th) => textOf(page(th)) === "Voto"))
      .toArray()
      .map((t) => parseBoxScore(page, page(t))),
  };
}
