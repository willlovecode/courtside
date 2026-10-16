import { describe, expect, it } from "vitest";
import { BlockedError, PoliteFetcher, minDelayMs, userAgent } from "../src/fetcher";
import { MemorySnapshotStore } from "../src/snapshots";

function setup(statuses: number[], options: { refresh?: boolean } = {}) {
  let clock = 1_000_000;
  const calls: { url: string; at: number; userAgent: string | undefined }[] = [];
  const queue = [...statuses];
  const store = new MemorySnapshotStore();
  const fetcher = new PoliteFetcher({
    store,
    refresh: options.refresh,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    fetchFn: (async (url: string, init?: RequestInit) => {
      calls.push({ url, at: clock, userAgent: (init?.headers as Record<string, string>)["user-agent"] });
      clock += 300;
      return new Response("<html></html>", { status: queue.shift() ?? 200 });
    }) as typeof fetch,
  });
  const key = (id: string) => ({ league: "l", season: "s", kind: "k", id });
  return { fetcher, store, calls, key };
}

describe("PoliteFetcher", () => {
  it("identifies itself and stores the page with a sidecar", async () => {
    const { fetcher, store, calls, key } = setup([200]);
    await fetcher.fetchPage(key("1"), "https://example.test/a");
    expect(calls[0]?.userAgent).toBe(userAgent);
    const snapshot = await store.get(key("1"));
    expect(snapshot?.body).toBe("<html></html>");
    expect(snapshot?.meta).toMatchObject({ url: "https://example.test/a", status: 200 });
  });

  it("waits at least 2.5 s between requests to the same host", async () => {
    const { fetcher, calls, key } = setup([200, 200, 200]);
    for (const id of ["1", "2", "3"]) await fetcher.fetchPage(key(id), `https://example.test/${id}`);
    const gaps = calls.slice(1).map((c, i) => c.at - (calls[i]?.at ?? 0));
    expect(gaps.every((gap) => gap >= minDelayMs)).toBe(true);
  });

  it("does not wait between different hosts", async () => {
    const { fetcher, calls, key } = setup([200, 200]);
    await fetcher.fetchPage(key("1"), "https://one.test/a");
    await fetcher.fetchPage(key("2"), "https://two.test/a");
    expect((calls[1]?.at ?? 0) - (calls[0]?.at ?? 0)).toBe(300);
  });

  it("skips pages that already have a snapshot unless asked to refresh", async () => {
    const first = setup([200, 200]);
    await first.fetcher.fetchPage(first.key("1"), "https://example.test/a");
    expect(await first.fetcher.fetchPage(first.key("1"), "https://example.test/a")).toBe("skipped");
    expect(first.calls).toHaveLength(1);

    const refreshing = setup([200, 200], { refresh: true });
    await refreshing.fetcher.fetchPage(refreshing.key("1"), "https://example.test/a");
    await refreshing.fetcher.fetchPage(refreshing.key("1"), "https://example.test/a");
    expect(refreshing.calls).toHaveLength(2);
  });

  it("retries once on a 5xx answer", async () => {
    const { fetcher, store, calls, key } = setup([503, 200]);
    await fetcher.fetchPage(key("1"), "https://example.test/a");
    expect(calls).toHaveLength(2);
    expect((await store.get(key("1")))?.meta.status).toBe(200);
  });

  it("gives up after a second 5xx answer and stores nothing", async () => {
    const { fetcher, store, calls, key } = setup([500, 502]);
    await expect(fetcher.fetchPage(key("1"), "https://example.test/a")).rejects.toThrow();
    expect(calls).toHaveLength(2);
    expect(await store.get(key("1"))).toBeNull();
  });

  it.each([403, 429])("never retries a %i and stops with BlockedError", async (status) => {
    const { fetcher, store, calls, key } = setup([status, 200]);
    await expect(fetcher.fetchPage(key("1"), "https://example.test/a")).rejects.toBeInstanceOf(BlockedError);
    expect(calls).toHaveLength(1);
    expect(await store.get(key("1"))).toBeNull();
  });

  it("keeps a 404 as a snapshot so it is not asked for again", async () => {
    const { fetcher, store, key } = setup([404]);
    await fetcher.fetchPage(key("1"), "https://example.test/a");
    expect((await store.get(key("1")))?.meta.status).toBe(404);
    expect(await fetcher.fetchPage(key("1"), "https://example.test/a")).toBe("skipped");
  });
});
