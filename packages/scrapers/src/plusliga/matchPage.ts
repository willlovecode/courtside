import { idFromHref, loadPage, parseNumber, textOf, type Nodes } from "./html";

export interface PageSetScore {
  setNumber: number;
  homePoints: number;
  awayPoints: number;
  durationMinutes: number | null;
}

export interface MatchPage {
  siteId: string;
  homeClubSiteId: string | null;
  awayClubSiteId: string | null;
  localDateTime: string;
  setsHome: number | null;
  setsAway: number | null;
  sets: PageSetScore[];
  /** The "Faza:" fact, e.g. "Zasadnicza". */
  phase: string | null;
  /** The "Termin:" fact; the round number in the regular season. */
  round: string | null;
  matchNumber: string | null;
  mvp: { playerSiteId: string; name: string } | null;
  attendance: number | null;
  venueName: string | null;
  venueCity: string | null;
}

/** "0:33" is hours and minutes. */
function parseDuration(text: string): number | null {
  const m = /^(\d+):(\d{2})$/.exec(text);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function parseMatchPage(html: string): MatchPage {
  const $ = loadPage(html);

  const box = $(".game-box-big").first();
  const siteId = box.closest("[data-game-id]").attr("data-game-id");
  if (!siteId) throw new Error("Match page without a game box");
  const scores = box.find(".game-result .game-score");

  // Facts sit in small two-column tables: <th>Faza:</th><td>…</td>.
  const facts = new Map<string, Nodes>();
  $("section table tr").each((_, row) => {
    const label = textOf($(row).children("th").first());
    const value = $(row).children("td").first();
    if (label.endsWith(":") && value.length) facts.set(label, value);
  });
  const fact = (label: string) => {
    const value = facts.get(label);
    return value ? textOf(value) || null : null;
  };

  const sets: PageSetScore[] = [];
  $("table")
    .filter((_, t) => textOf($(t).find("thead th").first()) === "Set" && textOf($(t).find("thead th").eq(1)) === "Czas")
    .first()
    .find("tbody tr")
    .each((_, row) => {
      const cells = $(row).children("td");
      const points = cells.eq(2).find("span.number");
      sets.push({
        setNumber: Number(textOf(cells.eq(0))),
        durationMinutes: parseDuration(textOf(cells.eq(1))),
        homePoints: Number(textOf(points.eq(0))),
        awayPoints: Number(textOf(points.eq(2))),
      });
    });

  const mvpLink = facts.get("MVP:")?.find("a").first();
  const mvpSiteId = idFromHref(mvpLink?.attr("href"), "players");

  return {
    siteId,
    homeClubSiteId: idFromHref(box.find(".game-team.left a").attr("href"), "teams"),
    awayClubSiteId: idFromHref(box.find(".game-team.right a").attr("href"), "teams"),
    localDateTime: textOf(box.find(".game-date")),
    setsHome: parseNumber(textOf(scores.eq(0))),
    setsAway: parseNumber(textOf(scores.eq(1))),
    sets,
    phase: fact("Faza:"),
    round: fact("Termin:"),
    matchNumber: fact("Numer meczu:"),
    mvp: mvpLink && mvpSiteId ? { playerSiteId: mvpSiteId, name: textOf(mvpLink) } : null,
    attendance: parseNumber(fact("Liczba widzów:") ?? ""),
    venueName: fact("Nazwa:"),
    venueCity: fact("Miasto:"),
  };
}
