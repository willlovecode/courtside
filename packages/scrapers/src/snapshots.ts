import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "@courtside/db";

/** Where one raw page lives: `<league>/<season>/<kind>/<id>`. */
export interface SnapshotKey {
  league: string;
  season: string;
  kind: string;
  id: string;
}

export interface SnapshotMeta {
  url: string;
  fetchedAt: string;
  status: number;
}

export interface Snapshot {
  key: SnapshotKey;
  meta: SnapshotMeta;
  body: string;
}

/** Raw page storage. The files on disk can later be replaced by Cloudflare R2 behind this interface. */
export interface SnapshotStore {
  get(key: SnapshotKey): Promise<Snapshot | null>;
  put(key: SnapshotKey, meta: SnapshotMeta, body: string): Promise<void>;
}

export const defaultSnapshotRoot = path.join(repoRoot, ".data", "snapshots");

export class FileSnapshotStore implements SnapshotStore {
  constructor(private readonly root: string = defaultSnapshotRoot) {}

  private base(key: SnapshotKey): string {
    return path.join(this.root, key.league, key.season, key.kind, key.id);
  }

  async get(key: SnapshotKey): Promise<Snapshot | null> {
    const base = this.base(key);
    try {
      const [body, meta] = await Promise.all([
        readFile(`${base}.html`, "utf8"),
        readFile(`${base}.json`, "utf8"),
      ]);
      return { key, meta: JSON.parse(meta) as SnapshotMeta, body };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async put(key: SnapshotKey, meta: SnapshotMeta, body: string): Promise<void> {
    const base = this.base(key);
    await mkdir(path.dirname(base), { recursive: true });
    await writeFile(`${base}.html`, body, "utf8");
    // The sidecar goes last, so a snapshot without one counts as missing.
    await writeFile(`${base}.json`, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }
}

export class MemorySnapshotStore implements SnapshotStore {
  private readonly snapshots = new Map<string, Snapshot>();

  async get(key: SnapshotKey): Promise<Snapshot | null> {
    return this.snapshots.get(JSON.stringify(key)) ?? null;
  }

  async put(key: SnapshotKey, meta: SnapshotMeta, body: string): Promise<void> {
    this.snapshots.set(JSON.stringify(key), { key, meta, body });
  }
}
