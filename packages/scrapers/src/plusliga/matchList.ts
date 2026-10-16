import { loadPage, parseNumber, textOf } from "./html";

export type PhaseLabel = "Faza Zasadnicza" | "Faza Play-Off";

export interface ListedMatch {
  siteId: string;
  homeClubSiteId: string;
  awayClubSiteId: string;
  homeName: string;
  awayName: string;
  /** "19.11.2025, 17:30", Europe/Warsaw wall-clock time. */
  localDateTime: string;
  phaseLabel: PhaseLabel;
  /** The heading above the Match: "Kolejka: 3", or "Runda I: Ćwierćfinał (do 2 zwycięstw)" in the playoffs. */
  roundHeading: string;
  /** Sets won by each side; null while the Match has not been played. */
  setsHome: number | null;
  setsAway: number | null;
}

/** Reads every Match of the Season's match list once, in page order. */
export function parseMatchList(html: string): ListedMatch[] {
  const $ = loadPage(html);
  const matches = new Map<string, ListedMatch>();
  let regularRound = "";
  let playoffRound = "";

  $("h3, h4, section.ajax-synced-games[data-game-id][data-team]").each((_, el) => {
    const node = $(el);
    if (el.tagName === "h4") {
      const heading = textOf(node);
      if (/^Kolejka:/.test(heading)) regularRound = heading;
      return;
    }
    if (el.tagName === "h3") {
      const heading = textOf(node);
      if (/^Runda /.test(heading)) playoffRound = heading;
      return;
    }

    const siteId = node.attr("data-game-id") ?? "";
    // The same Match can be listed twice; the first listing wins.
    if (matches.has(siteId)) return;

    const [homeClubSiteId, awayClubSiteId] = (node.attr("data-team") ?? "").split(",");
    if (!homeClubSiteId || !awayClubSiteId) throw new Error(`Match ${siteId} has no data-team`);

    const phaseLabel = textOf(node.find(".game-stage")) as PhaseLabel;
    if (phaseLabel !== "Faza Zasadnicza" && phaseLabel !== "Faza Play-Off") {
      throw new Error(`Match ${siteId} has an unknown phase "${phaseLabel}"`);
    }
    const roundHeading = phaseLabel === "Faza Zasadnicza" ? regularRound : playoffRound;
    if (!roundHeading) throw new Error(`Match ${siteId} has no round heading`);

    const scores = node.find(".game-score");
    matches.set(siteId, {
      siteId,
      homeClubSiteId,
      awayClubSiteId,
      homeName: textOf(node.find(".game-team.left")),
      awayName: textOf(node.find(".game-team.right")),
      localDateTime: textOf(node.find(".game-date span").first()),
      phaseLabel,
      roundHeading,
      setsHome: parseNumber(textOf(scores.eq(0))),
      setsAway: parseNumber(textOf(scores.eq(1))),
    });
  });

  return [...matches.values()];
}
