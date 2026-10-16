import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fetchPlusLiga } from "../src/plusliga/fetch";
import { MemorySnapshotStore, type SnapshotKey } from "../src/snapshots";

const fixture = (name: string) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "plusliga", name), "utf8");

/** Stands in for the polite fetcher: serves fixtures, and the site's 404 for one team page. */
function fakeFetcher(store: MemorySnapshotStore, missingTeamId: string) {
  const fetched: string[] = [];
  return {
    fetched,
    async fetchPage(key: SnapshotKey, url: string) {
      fetched.push(`${key.season}/${key.kind}/${key.id}`);
      const bodies: Record<string, string> = {
        matchlist: fixture("matchlist.html"),
        standings: fixture("standings.html"),
        teams: fixture("teams-index.html"),
        team: fixture("team-2.html"),
        match: fixture("match-1104534.html"),
        player: "<html></html>",
      };
      const missing = key.kind === "team" && key.id === missingTeamId;
      await store.put(key, { url, fetchedAt: "2026-10-16T00:00:00.000Z", status: missing ? 404 : 200 }, missing ? "" : (bodies[key.kind] ?? ""));
      return "fetched" as const;
    },
  };
}

describe("fetchPlusLiga", () => {
  it("skips a page the site did not serve instead of crashing, and warns", async () => {
    const store = new MemorySnapshotStore();
    const fetcher = fakeFetcher(store, "8");
    const log: string[] = [];
    await fetchPlusLiga({ store, fetcher, log: (m) => log.push(m) }, "2025-26");

    expect(log.filter((m) => m.startsWith("warning:") && m.includes("team/8"))).toHaveLength(2); // 2025-26 and 2026-27
    // The other teams still led to Player pages: 15 on the fixture roster, plus the MVP of the fixture match.
    expect(fetcher.fetched.filter((k) => k.includes("/player/"))).toHaveLength(16);
    expect(fetcher.fetched.filter((k) => k.startsWith("2026-27/team/"))).toHaveLength(14);
  });

  it("reads the 2026-27 tour from the Season selector", async () => {
    const store = new MemorySnapshotStore();
    const urls: string[] = [];
    const fetcher = {
      async fetchPage(key: SnapshotKey, url: string) {
        urls.push(url);
        await fakeFetcher(store, "none").fetchPage(key, url);
        return "fetched" as const;
      },
    };
    await fetchPlusLiga({ store, fetcher, log: () => {} }, "2025-26");
    expect(urls).toContain("https://www.tauronliga.pl/teams/tour/53/nocookies/1.html");
  });
});
