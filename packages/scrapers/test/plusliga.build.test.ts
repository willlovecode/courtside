import { beforeAll, describe, expect, it } from "vitest";
import type { ParsedLeague } from "../src/model";
import { buildPlusLiga } from "../src/plusliga/build";
import { fetchPlusLiga } from "../src/plusliga/fetch";
import { MemorySnapshotStore } from "../src/snapshots";
import { fakeFetcher } from "./helpers/fakeSite";

// Every page of a kind is the fixture of that kind, so this checks the structure of the result, not real data.
describe("buildPlusLiga", () => {
  let parsed: ParsedLeague;
  beforeAll(async () => {
    const store = new MemorySnapshotStore();
    await fetchPlusLiga({ store, fetcher: fakeFetcher(store), log: () => {} }, "2025-26");
    parsed = await buildPlusLiga(store, "2025-26");
  });

  it("puts the placement matches in a Phase of their own", () => {
    const season = parsed.seasons.find((s) => s.label === "2025-26");
    const phases = Object.fromEntries((season?.phases ?? []).map((p) => [p.kind, p]));
    const count = (phaseId: string | undefined) => season?.matches.filter((m) => m.phaseId === phaseId).length;
    expect(Object.keys(phases)).toEqual(["regular", "playoffs", "placement"]);
    expect(count(phases.regular?.id)).toBe(182);
    expect(count(phases.playoffs?.id)).toBe(19);
    expect(count(phases.placement?.id)).toBe(7);
    expect(phases.placement?.rounds.map((r) => r.label)).toEqual([
      "Runda III: Mecze o 5. miejsce (do 2 zwycięstw)",
      "Runda III: Mecze o 3. miejsce (do 3 zwycięstw)",
    ]);
    expect(phases.playoffs?.rounds.map((r) => r.label)).toEqual([
      "Runda I: Ćwierćfinał (do 2 zwycięstw)",
      "Runda II: Półfinał (do 2 zwycięstw)",
      "Runda III: Finał (do 3 zwycięstw)",
    ]);
    expect(phases.regular?.rounds).toHaveLength(26);
  });

  it("prefixes the League into Club, Team, Player, Match and Season ids", () => {
    const season = parsed.seasons[0];
    expect(parsed.clubs.every((c) => c.id === `plusliga-${c.slug}`)).toBe(true);
    expect(season?.id).toBe("plusliga-2025-26");
    expect(season?.teams.every((t) => t.id.startsWith("plusliga-") && t.id.endsWith("-2025-26"))).toBe(true);
    expect(season?.matches.every((m) => m.id.startsWith("plusliga-"))).toBe(true);
    expect(parsed.players.every((p) => p.id.startsWith("plusliga-"))).toBe(true);
  });

  it("keeps public slugs free of the League prefix and of sponsor names", () => {
    expect(parsed.clubs.find((c) => c.id === "plusliga-warta-zawiercie")?.slug).toBe("warta-zawiercie");
    expect(parsed.seasons[0]?.matches[0]?.slug).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z-]+$/);
  });

  it("reports pages it could not use as warnings instead of stopping", async () => {
    const store = new MemorySnapshotStore();
    await fetchPlusLiga({ store, fetcher: fakeFetcher(store), log: () => {} }, "2025-26");
    await store.put({ league: "plusliga", season: "2025-26", kind: "match", id: "1104708" }, { url: "u", fetchedAt: "x", status: 404 }, "");
    const result = await buildPlusLiga(store, "2025-26");
    expect(result.warnings).toEqual(["no usable page for Match 1104708"]);
    expect(result.seasons[0]?.matches).toHaveLength(208);
  });
});
