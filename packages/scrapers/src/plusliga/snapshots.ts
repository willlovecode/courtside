import type { SnapshotKey, SnapshotStore } from "../snapshots";
import { leagueId, pageKinds } from "./config";

type PageKind = (typeof pageKinds)[keyof typeof pageKinds];

export function snapshotKey(season: string, kind: PageKind, id: string): SnapshotKey {
  return { league: leagueId, season, kind, id };
}

/** The stored page, or null when it was never fetched or the site answered with an error. */
export async function readPage(store: SnapshotStore, key: SnapshotKey): Promise<string | null> {
  const snapshot = await store.get(key);
  return snapshot && snapshot.meta.status === 200 ? snapshot.body : null;
}

export async function requirePage(store: SnapshotStore, key: SnapshotKey): Promise<string> {
  const body = await readPage(store, key);
  if (body === null) {
    throw new Error(`No usable snapshot for ${key.season}/${key.kind}/${key.id}; run the fetch step first`);
  }
  return body;
}
