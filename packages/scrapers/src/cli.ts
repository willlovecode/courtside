import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { openDatabase, repoRoot } from "@courtside/db";
import { adapters } from "./adapters";
import { BlockedError, PoliteFetcher } from "./fetcher";
import { loadLeague } from "./load";
import type { ParsedLeague } from "./model";
import { checkSeasons, formatReport } from "./runChecks";
import { FileSnapshotStore } from "./snapshots";

const steps = ["fetch", "parse", "load", "check", "all"] as const;
type Step = (typeof steps)[number];

const usage = `Usage: npm run scrape -- --league <id> --season <2025-26> [--step ${steps.join("|")}] [--refresh]
Leagues: ${Object.keys(adapters).join(", ")}`;

const log = (message: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${message}`);

function parsedPath(league: string, season: string): string {
  return path.join(repoRoot, ".data", "parsed", league, `${season}.json`);
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      league: { type: "string" },
      season: { type: "string" },
      step: { type: "string", default: "all" },
      refresh: { type: "boolean", default: false },
    },
  });
  const adapter = values.league ? adapters[values.league] : undefined;
  const step = values.step as Step;
  if (!adapter || !values.season || !steps.includes(step)) {
    console.error(usage);
    return 2;
  }
  const season = values.season;
  const store = new FileSnapshotStore();
  const wanted = (name: Step) => step === "all" || step === name;

  if (wanted("fetch")) {
    const fetcher = new PoliteFetcher({ store, refresh: values.refresh, log });
    try {
      await adapter.fetch({ store, fetcher, log }, season);
    } catch (error) {
      if (error instanceof BlockedError) {
        log(error.message);
        return 3;
      }
      throw error;
    }
    log("fetch done");
  }

  if (wanted("parse")) {
    const parsed = await adapter.parse(store, season, log);
    const file = parsedPath(adapter.id, season);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(parsed, null, 1)}\n`, "utf8");
    for (const s of parsed.seasons) {
      log(
        `parsed ${s.label}: ${s.teams.length} teams, ${s.rosterEntries.length} roster entries, ${s.matches.length} matches, ` +
          `${s.matches.reduce((n, m) => n + m.sets.length, 0)} sets, ${s.boxScoreLines.length} box score lines, ${s.standings.length} standings`,
      );
    }
    log(`parsed ${parsed.players.length} players, ${parsed.clubs.length} clubs -> ${path.relative(repoRoot, file)}`);
  }

  if (wanted("load")) {
    const parsed = JSON.parse(await readFile(parsedPath(adapter.id, season), "utf8")) as ParsedLeague;
    const handle = openDatabase();
    try {
      await handle.migrate();
      const summary = await loadLeague(handle.db, parsed);
      log(`loaded into ${handle.kind}: ${JSON.stringify(summary)}`);
    } finally {
      await handle.close();
    }
  }

  if (wanted("check")) {
    const handle = openDatabase();
    try {
      await handle.migrate();
      const report = await checkSeasons(handle.db, adapter.id, adapter.seasonsFor(season));
      console.log(formatReport(report));
      if (report.failures > 0) return 1;
    } finally {
      await handle.close();
    }
  }
  return 0;
}

process.exitCode = await main();
