import type { PoliteFetcher } from "../fetcher";
import type { SnapshotKey, SnapshotStore } from "../snapshots";
import { pageKinds, urls } from "./config";
import { matchIdsOnList, playerIdsOnMatchPage, playerIdsOnTeamPage } from "./discover";
import { seasonPlans, tourOf } from "./seasons";
import { readPage, requirePage, snapshotKey } from "./snapshots";
import { parseTeamIndex } from "./teamPage";

interface FetchContext {
  store: SnapshotStore;
  fetcher: Pick<PoliteFetcher, "fetchPage">;
  log: (message: string) => void;
}

/**
 * Downloads every page that parse needs for `season`, plus the Rosters of the
 * Seasons the plan names. Pages already stored are skipped by the fetcher.
 */
export async function fetchPlusLiga(ctx: FetchContext, season: string): Promise<void> {
  const plan = seasonPlans[season];
  if (!plan) throw new Error(`No plan for PlusLiga ${season}`);
  const { store, fetcher, log } = ctx;

  const mainTour = await tourOf(store, season);
  log(`PlusLiga ${season} is tour ${mainTour}`);

  await fetcher.fetchPage(snapshotKey(season, pageKinds.matchList, "all"), urls.matchList(mainTour));
  await fetcher.fetchPage(snapshotKey(season, pageKinds.standings, "final"), urls.standings(mainTour));
  await fetcher.fetchPage(snapshotKey(season, pageKinds.teamIndex, "index"), urls.teamIndex(mainTour));

  // Team pages come first: the Season selector on them tells us the tours of the other Seasons.
  const teamIds = await fetchTeamPages(ctx, season, mainTour);

  const rosterPlayers = new Map<string, { season: string; tour: number }>();
  for (const teamId of teamIds) {
    const html = await usablePage(ctx, snapshotKey(season, pageKinds.team, teamId));
    if (html === null) continue;
    for (const id of playerIdsOnTeamPage(html)) rosterPlayers.set(id, { season, tour: mainTour });
  }
  for (const rosterSeason of plan.rosterSeasons) {
    const tour = await tourOf(store, rosterSeason);
    await fetcher.fetchPage(snapshotKey(rosterSeason, pageKinds.teamIndex, "index"), urls.teamIndex(tour));
    for (const teamId of await fetchTeamPages(ctx, rosterSeason, tour)) {
      const html = await usablePage(ctx, snapshotKey(rosterSeason, pageKinds.team, teamId));
      if (html === null) continue;
      for (const id of playerIdsOnTeamPage(html)) {
        if (!rosterPlayers.has(id)) rosterPlayers.set(id, { season: rosterSeason, tour });
      }
    }
  }

  const listHtml = await requirePage(store, snapshotKey(season, pageKinds.matchList, "all"));
  const matchIds = matchIdsOnList(listHtml);
  log(`${matchIds.length} Matches to fetch`);
  for (const matchId of matchIds) {
    await fetcher.fetchPage(snapshotKey(season, pageKinds.match, matchId), urls.match(mainTour, matchId));
  }

  // An MVP can be a Player who is on no Roster, e.g. after leaving the League.
  for (const matchId of matchIds) {
    const html = await usablePage(ctx, snapshotKey(season, pageKinds.match, matchId));
    if (html === null) continue;
    for (const id of playerIdsOnMatchPage(html)) {
      if (!rosterPlayers.has(id)) rosterPlayers.set(id, { season, tour: mainTour });
    }
  }

  log(`${rosterPlayers.size} Player pages to fetch`);
  for (const [playerId, where] of rosterPlayers) {
    await fetcher.fetchPage(snapshotKey(where.season, pageKinds.player, playerId), urls.player(where.tour, playerId));
  }
}

/** A page we can read links from; one the site refused to serve is skipped with a warning and retried on the next run. */
async function usablePage(ctx: FetchContext, key: SnapshotKey): Promise<string | null> {
  const html = await readPage(ctx.store, key);
  if (html === null) ctx.log(`warning: no usable snapshot for ${key.kind}/${key.id} in ${key.season}, skipping it`);
  return html;
}

async function fetchTeamPages(ctx: FetchContext, season: string, tour: number): Promise<string[]> {
  const indexHtml = await requirePage(ctx.store, snapshotKey(season, pageKinds.teamIndex, "index"));
  const teamIds = parseTeamIndex(indexHtml);
  for (const teamId of teamIds) {
    await ctx.fetcher.fetchPage(snapshotKey(season, pageKinds.team, teamId), urls.team(tour, teamId));
  }
  return teamIds;
}
