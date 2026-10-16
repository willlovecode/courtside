import type { PoliteFetcher } from "./fetcher";
import type { ParsedLeague } from "./model";
import type { SnapshotStore } from "./snapshots";
import { buildPlusLiga } from "./plusliga/build";
import { leagueId as plusLigaId } from "./plusliga/config";
import { fetchPlusLiga } from "./plusliga/fetch";
import { seasonPlans } from "./plusliga/seasons";

/** One League's scraper: the first two steps are its own, load and check are shared. */
export interface LeagueAdapter {
  id: string;
  /** The Season that was asked for, followed by the Seasons that only bring Rosters. */
  seasonsFor(season: string): string[];
  /** Downloads pages into the snapshot store. Never interprets them. */
  fetch(ctx: { store: SnapshotStore; fetcher: PoliteFetcher; log: (message: string) => void }, season: string): Promise<void>;
  /** Turns snapshots into the shared model. Never touches the network. */
  parse(store: SnapshotStore, season: string, log: (message: string) => void): Promise<ParsedLeague>;
}

const plusLiga: LeagueAdapter = {
  id: plusLigaId,
  seasonsFor: (season) => [season, ...(seasonPlans[season]?.rosterSeasons ?? [])],
  fetch: fetchPlusLiga,
  parse: buildPlusLiga,
};

export const adapters: Record<string, LeagueAdapter> = { [plusLiga.id]: plusLiga };
