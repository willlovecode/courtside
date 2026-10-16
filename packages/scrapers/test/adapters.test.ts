import { describe, expect, it } from "vitest";
import { adapters } from "../src/adapters";
import { clubsByCode } from "../src/superlega/config";
import { clubsBySiteId } from "../src/plusliga/config";

describe("adapters", () => {
  it("offers PlusLiga and SuperLega, each with the Rosters of the following Season", () => {
    expect(Object.keys(adapters).sort()).toEqual(["plusliga", "superlega"]);
    expect(adapters.plusliga?.seasonsFor("2025-26")).toEqual(["2025-26", "2026-27"]);
    expect(adapters.superlega?.seasonsFor("2025-26")).toEqual(["2025-26", "2026-27"]);
  });

  it("has Club slugs that are unique within a League", () => {
    for (const clubs of [Object.values(clubsBySiteId), Object.values(clubsByCode)]) {
      const slugs = clubs.map((c) => c.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});
