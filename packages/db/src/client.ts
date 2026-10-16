import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DatabaseHandle {
  db: Database;
  /** "pglite" for local development, "postgres" when DATABASE_URL is set. */
  kind: "pglite" | "postgres";
  /** Applies the SQL migrations in packages/db/drizzle. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = path.resolve(packageDir, "..", "..");
export const defaultPglitePath = path.join(repoRoot, ".data", "pglite");
const migrationsFolder = path.join(packageDir, "drizzle");

export interface OpenDatabaseOptions {
  /** Postgres connection string; falls back to DATABASE_URL, then to PGlite. */
  databaseUrl?: string;
  /** PGlite data directory; `memory://` keeps it in memory (tests). */
  pglitePath?: string;
}

export function openDatabase(options: OpenDatabaseOptions = {}): DatabaseHandle {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      kind: "postgres",
      migrate: () => migratePg(db, { migrationsFolder }),
      close: () => pool.end(),
    };
  }

  const dataDir = options.pglitePath ?? defaultPglitePath;
  if (!dataDir.startsWith("memory://")) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  return {
    db,
    kind: "pglite",
    migrate: () => migratePglite(db, { migrationsFolder }),
    close: () => client.close(),
  };
}
