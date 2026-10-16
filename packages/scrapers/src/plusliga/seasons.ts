import type { SnapshotStore } from "../snapshots";
import { knownTours, pageKinds, seasonLabelOnSite } from "./config";
import { readPage, requirePage, snapshotKey } from "./snapshots";
import { parseSeasonLinks, parseTeamIndex } from "./teamPage";

/** What `--season 2025-26` brings in: that Season in full, and the Rosters of the next one. */
export const seasonPlans: Record<string, { rosterSeasons: string[] }> = {
  "2025-26": { rosterSeasons: ["2026-27"] },
};

const anchorSeason = "2025-26";

/**
 * The tour of a Season. 2025-26 is known; the others are read from the Season
 * selector of a 2025-26 team page.
 */
export async function tourOf(store: SnapshotStore, season: string): Promise<number> {
  const known = knownTours[season];
  if (known !== undefined) return known;

  const indexHtml = await requirePage(store, snapshotKey(anchorSeason, pageKinds.teamIndex, "index"));
  const wanted = seasonLabelOnSite(season);
  // Any team page will do; skip the ones the site did not serve.
  for (const teamId of parseTeamIndex(indexHtml)) {
    const teamHtml = await readPage(store, snapshotKey(anchorSeason, pageKinds.team, teamId));
    if (teamHtml === null) continue;
    const link = parseSeasonLinks(teamHtml).find((l) => l.label === wanted);
    if (!link) throw new Error(`The Season selector has no "${wanted}"`);
    return link.tour;
  }
  throw new Error(`No usable ${anchorSeason} team page to read the Season selector from`);
}
