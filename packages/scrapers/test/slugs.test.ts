import { describe, expect, it } from "vitest";
import { resolveSlugs, withoutLeaguePrefix } from "../src/slugs";

describe("resolveSlugs", () => {
  it("gives a new row the slug it wants", () => {
    const result = resolveSlugs([{ id: "pl-p1", slug: "jan-kowalski", suffix: "p1" }], new Map());
    expect(result.get("pl-p1")).toBe("jan-kowalski");
  });

  it("adds the suffix when another row, e.g. of another League, has the slug", () => {
    const existing = new Map([["it-p7", "wilfredo-leon"]]);
    const result = resolveSlugs([{ id: "pl-p3", slug: "wilfredo-leon", suffix: "p3" }], existing);
    expect(result.get("pl-p3")).toBe("wilfredo-leon-p3");
  });

  it("keeps the slug a row already has, even if the wanted slug changed or a lower id is gone", () => {
    const existing = new Map([
      ["pl-p9", "marcel-kicinski-p9"],
      ["pl-p1", "marcel-kicinski"],
    ]);
    // Run without pl-p1: pl-p9 would now want the plain slug, but keeps what it had.
    const result = resolveSlugs([{ id: "pl-p9", slug: "marcel-kicinski", suffix: "p9" }], existing);
    expect(result.get("pl-p9")).toBe("marcel-kicinski-p9");
  });

  it("settles two new rows with the same wish in id order", () => {
    const result = resolveSlugs(
      [
        { id: "pl-p9", slug: "anna-nowak", suffix: "p9" },
        { id: "pl-p2", slug: "anna-nowak", suffix: "p2" },
      ],
      new Map(),
    );
    expect(result.get("pl-p2")).toBe("anna-nowak");
    expect(result.get("pl-p9")).toBe("anna-nowak-p9");
  });

  it("still ends up unique when the suffixed slug is taken too", () => {
    const existing = new Map([
      ["a", "x"],
      ["b", "x-p2"],
    ]);
    expect(resolveSlugs([{ id: "c", slug: "x", suffix: "p2" }], existing).get("c")).toBe("x-p2-2");
  });
});

describe("withoutLeaguePrefix", () => {
  it("strips the League id", () => {
    expect(withoutLeaguePrefix("plusliga-p1453", "plusliga")).toBe("p1453");
    expect(withoutLeaguePrefix("other-p1", "plusliga")).toBe("other-p1");
  });
});
