import type { PoliteFetcher } from "../fetcher";
import type { SnapshotKey, SnapshotStore } from "../snapshots";
import { annoOf, pageKinds, urls } from "./config";
import {
  competitionsOf,
  matchIdsOnBracket,
  playerKeysOnMatchPage,
  playerKeysOnTeamPage,
  readResultsLinks,
} from "./discover";
import { seasonPlans } from "./seasons";
import { readPage, requirePage, snapshotKey } from "./snapshots";

interface FetchContext {
  store: SnapshotStore;
  fetcher: Pick<PoliteFetcher, "fetchPage">;
  log: (message: string) => void;
}

/** A page we can read links from; one the site refused to serve is skipped with a warning and retried on the next run. */
async function usablePage(ctx: FetchContext, key: SnapshotKey): Promise<string | null> {
  const html = await readPage(ctx.store, key);
  if (html === null) ctx.log(`warning: no usable snapshot for ${key.kind}/${key.id} in ${key.season}, skipping it`);
  return html;
}

interface SeasonPages {
  matchIds: string[];
  teamIds: string[];
}

/**
 * Downloads the results of a Season. A full Season brings every round of the regular
 * season, the play-off brackets and the final table; a Rosters-only Season just the
 * first round, which lists every Team once.
 */
async function fetchResults(ctx: FetchContext, season: string, full: boolean): Promise<SeasonPages> {
  const { store, fetcher } = ctx;
  const anno = annoOf(season);
  const matchIds: string[] = [];
  const teamIds = new Set<string>();

  await fetcher.fetchPage(snapshotKey(season, pageKinds.resultsRoot, "root"), urls.resultsRoot(anno));
  const competitions = competitionsOf(readResultsLinks(await requirePage(store, snapshotKey(season, pageKinds.resultsRoot, "root"))));
  if (!competitions.regular) throw new Error(`No regular season SuperLega competition for ${season}`);
  const regular = competitions.regular;

  const collect = (html: string) => {
    for (const result of readResultsLinks(html).results) {
      if (result.matchSiteId && !matchIds.includes(result.matchSiteId)) matchIds.push(result.matchSiteId);
      teamIds.add(result.homeTeamSiteId).add(result.awayTeamSiteId);
    }
  };

  await fetcher.fetchPage(snapshotKey(season, pageKinds.results, regular), urls.results(anno, regular));
  const base = await requirePage(store, snapshotKey(season, pageKinds.results, regular));
  if (!full) {
    collect(base);
    return { matchIds: [], teamIds: [...teamIds] };
  }

  for (const fase of readResultsLinks(base).fasi) {
    const faseId = `${regular}-${fase.value}`;
    await fetcher.fetchPage(snapshotKey(season, pageKinds.results, faseId), urls.results(anno, regular, fase.value));
    const fasePage = await usablePage(ctx, snapshotKey(season, pageKinds.results, faseId));
    if (fasePage === null) continue;
    for (const giornata of readResultsLinks(fasePage).giornate) {
      const key = snapshotKey(season, pageKinds.results, `${faseId}-${giornata.value}`);
      await fetcher.fetchPage(key, urls.results(anno, regular, fase.value, giornata.value));
      const html = await usablePage(ctx, key);
      if (html !== null) collect(html);
    }
  }

  for (const competition of [competitions.playoffs, competitions.placement]) {
    if (!competition) continue;
    const key = snapshotKey(season, pageKinds.bracket, competition);
    await fetcher.fetchPage(key, urls.results(anno, competition));
    const html = await usablePage(ctx, key);
    if (html === null) continue;
    for (const id of matchIdsOnBracket(html)) if (!matchIds.includes(id)) matchIds.push(id);
  }

  await fetcher.fetchPage(snapshotKey(season, pageKinds.standings, "final"), urls.standings(anno, regular));
  return { matchIds, teamIds: [...teamIds] };
}

/** Downloads every page that parse needs for `season`, plus the Rosters of the Seasons the plan names. */
export async function fetchSuperLega(ctx: FetchContext, season: string): Promise<void> {
  const plan = seasonPlans[season];
  if (!plan) throw new Error(`No plan for SuperLega ${season}`);
  const { fetcher, log } = ctx;

  const main = await fetchResults(ctx, season, true);
  log(`${main.matchIds.length} Matches and ${main.teamIds.length} Teams in ${season}`);
  const rosterSeasons = new Map<string, SeasonPages>();
  for (const rosterSeason of plan.rosterSeasons) rosterSeasons.set(rosterSeason, await fetchResults(ctx, rosterSeason, false));

  // Every Player page is fetched once, under the Season it was first found in.
  const players = new Map<string, string>();
  const seasonsToFetch: [string, SeasonPages][] = [[season, main], ...rosterSeasons];
  for (const [label, pages] of seasonsToFetch) {
    for (const teamId of pages.teamIds) {
      const key = snapshotKey(label, pageKinds.team, teamId);
      await fetcher.fetchPage(key, urls.team(teamId));
      const html = await usablePage(ctx, key);
      if (html === null) continue;
      for (const playerKey of playerKeysOnTeamPage(html)) if (!players.has(playerKey)) players.set(playerKey, label);
    }
  }

  for (const matchId of main.matchIds) {
    await fetcher.fetchPage(snapshotKey(season, pageKinds.match, matchId), urls.match(matchId));
  }
  // Box scores also list Players who are on no Roster any more.
  for (const matchId of main.matchIds) {
    const html = await usablePage(ctx, snapshotKey(season, pageKinds.match, matchId));
    if (html === null) continue;
    for (const playerKey of playerKeysOnMatchPage(html)) if (!players.has(playerKey)) players.set(playerKey, season);
  }

  log(`${players.size} Player pages to fetch`);
  for (const [playerKey, label] of players) {
    await fetcher.fetchPage(snapshotKey(label, pageKinds.player, playerKey), urls.player(playerKey));
  }
}
