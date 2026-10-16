import { describe, expect, it } from "vitest";
import { fetchPlusLiga } from "../src/plusliga/fetch";
import { MemorySnapshotStore } from "../src/snapshots";
import { fakeFetcher } from "./helpers/fakeSite";

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
    const fetcher = fakeFetcher(store);
    await fetchPlusLiga({ store, fetcher, log: () => {} }, "2025-26");
    expect(fetcher.urls).toContain("https://www.tauronliga.pl/teams/tour/53/nocookies/1.html");
  });
});
