import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FileSnapshotStore } from "../src/snapshots";

describe("FileSnapshotStore", () => {
  const dirs: string[] = [];
  afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

  it("keeps raw HTML at <league>/<season>/<kind>/<id>.html with a JSON sidecar", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "courtside-snapshots-"));
    dirs.push(root);
    const store = new FileSnapshotStore(root);
    const key = { league: "plusliga", season: "2025-26", kind: "match", id: "1104534" };
    const meta = { url: "https://example.test/m", fetchedAt: "2026-10-16T09:00:00.000Z", status: 200 };

    expect(await store.get(key)).toBeNull();
    await store.put(key, meta, "<p>Zażółć</p>");

    const base = path.join(root, "plusliga", "2025-26", "match", "1104534");
    expect(await readFile(`${base}.html`, "utf8")).toBe("<p>Zażółć</p>");
    expect(JSON.parse(await readFile(`${base}.json`, "utf8"))).toEqual(meta);
    expect(await store.get(key)).toEqual({ key, meta, body: "<p>Zażółć</p>" });
  });
});
