import type { SnapshotKey, SnapshotStore } from "./snapshots";

export const userAgent = "CourtsideBot/0.1 (non-commercial volleyball fan project)";
export const minDelayMs = 2500;

/** The site refused us (403 or 429). Fetching for that League stops. */
export class BlockedError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`${url} answered ${status}; stopping this League`);
    this.name = "BlockedError";
  }
}

export interface FetcherOptions {
  store: SnapshotStore;
  /** Re-download pages that already have a snapshot. */
  refresh?: boolean;
  log?: (message: string) => void;
  // Injectable so tests need neither network nor real waiting.
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type FetchOutcome = "fetched" | "skipped";

export class PoliteFetcher {
  private readonly lastRequestEnd = new Map<string, number>();
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly log: (message: string) => void;

  constructor(private readonly options: FetcherOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => {});
  }

  /** Stores the page at `url` under `key` unless a snapshot is already there. */
  async fetchPage(key: SnapshotKey, url: string): Promise<FetchOutcome> {
    if (!this.options.refresh) {
      const existing = await this.options.store.get(key);
      if (existing && existing.meta.status < 500) return "skipped";
    }

    let response = await this.request(url).catch((error: unknown) => error as Error);
    if (response instanceof Error || response.status >= 500) {
      this.log(`${response instanceof Error ? response.message : response.status} from ${url}, retrying once`);
      response = await this.request(url);
    }
    if (response.status === 403 || response.status === 429) throw new BlockedError(url, response.status);
    if (response.status >= 500) {
      this.log(`${response.status} from ${url} again, not stored`);
      throw new Error(`${url} answered ${response.status}`);
    }

    const meta = { url, fetchedAt: new Date(this.now()).toISOString(), status: response.status };
    await this.options.store.put(key, meta, response.body);
    this.log(`${response.status} ${url}`);
    return "fetched";
  }

  /** One request, spaced from the previous one to the same host; the delay counts from the end of that download. */
  private async request(url: string): Promise<{ status: number; body: string }> {
    const host = new URL(url).host;
    const last = this.lastRequestEnd.get(host);
    if (last !== undefined) {
      const wait = last + minDelayMs - this.now();
      if (wait > 0) await this.sleep(wait);
    }
    try {
      const response = await this.fetchFn(url, {
        headers: { "user-agent": userAgent, "accept-language": "pl,en;q=0.5" },
      });
      return { status: response.status, body: await response.text() };
    } finally {
      this.lastRequestEnd.set(host, this.now());
    }
  }
}
