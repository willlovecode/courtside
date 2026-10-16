import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MemorySnapshotStore, SnapshotKey } from "../../src/snapshots";

export const fixture = (name: string) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "plusliga", name), "utf8");

/**
 * Stands in for the polite fetcher. Serves the fixtures for every page of its kind
 * (so all Matches look like the fixture Match), and the site's 404 for one team page.
 */
export function fakeFetcher(store: MemorySnapshotStore, missingTeamId = "none") {
  const fetched: string[] = [];
  const urls: string[] = [];
  return {
    fetched,
    urls,
    async fetchPage(key: SnapshotKey, url: string) {
      fetched.push(`${key.season}/${key.kind}/${key.id}`);
      urls.push(url);
      const bodies: Record<string, string> = {
        matchlist: fixture("matchlist.html"),
        standings: fixture("standings.html"),
        teams: fixture("teams-index.html"),
        team: fixture("team-2.html"),
        match: fixture("match-1104534.html"),
        player: "<html></html>",
      };
      const missing = key.kind === "team" && key.id === missingTeamId;
      await store.put(
        key,
        { url, fetchedAt: "2026-10-16T00:00:00.000Z", status: missing ? 404 : 200 },
        missing ? "" : (bodies[key.kind] ?? ""),
      );
      return "fetched" as const;
    },
  };
}
