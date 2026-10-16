import type { SnapshotKey } from "../snapshots";
import { leagueId, pageKinds } from "./config";

export { readPage, requirePage } from "../snapshots";

type PageKind = (typeof pageKinds)[keyof typeof pageKinds];

export function snapshotKey(season: string, kind: PageKind, id: string): SnapshotKey {
  return { league: leagueId, season, kind, id };
}
