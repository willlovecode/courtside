import { getTableColumns, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { schema, type Database } from "@courtside/db";
import type { ParsedLeague } from "./model";

const chunkSize = 500;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) out.push(rows.slice(i, i + chunkSize));
  return out;
}

/** Columns to overwrite when a row with the same key already exists. */
function overwrite(columns: Record<string, PgColumn>, except: string[]): Record<string, ReturnType<typeof sql>> {
  return Object.fromEntries(
    Object.entries(columns)
      .filter(([key]) => !except.includes(key))
      .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
  );
}

async function upsert<T extends PgTable>(
  db: Database,
  table: T,
  rows: T["$inferInsert"][],
  target: PgColumn[],
  keyFields: string[],
): Promise<void> {
  const columns = getTableColumns(table);
  for (const part of chunks(rows)) {
    await db
      .insert(table)
      .values(part)
      .onConflictDoUpdate({ target, set: overwrite(columns, keyFields) });
  }
}

export interface LoadSummary {
  clubs: number;
  teams: number;
  players: number;
  rosterEntries: number;
  matches: number;
  setScores: number;
  boxScoreLines: number;
  standings: number;
}

/** Upserts everything in `parsed`. Rows that belong to a Season's Matches, Rosters or Standings are replaced as a whole. */
export async function loadLeague(db: Database, parsed: ParsedLeague): Promise<LoadSummary> {
  const summary: LoadSummary = {
    clubs: parsed.clubs.length,
    teams: 0,
    players: parsed.players.length,
    rosterEntries: 0,
    matches: 0,
    setScores: 0,
    boxScoreLines: 0,
    standings: 0,
  };
  const s = schema;

  await db.transaction(async (tx) => {
    await upsert(tx, s.leagues, [{ ...parsed.league }], [s.leagues.id], ["id"]);
    await upsert(
      tx,
      s.seasons,
      parsed.seasons.map((season) => ({ id: season.id, leagueId: parsed.league.id, label: season.label })),
      [s.seasons.id],
      ["id"],
    );
    await upsert(
      tx,
      s.clubs,
      parsed.clubs.map((club) => ({ ...club, leagueId: parsed.league.id })),
      [s.clubs.id],
      ["id"],
    );
    await upsert(tx, s.players, parsed.players, [s.players.id], ["id"]);

    for (const season of parsed.seasons) {
      const teamIds = season.teams.map((t) => t.id);
      const matchIds = season.matches.map((m) => m.id);
      const phaseIds = season.phases.map((p) => p.id);

      await upsert(
        tx,
        s.teams,
        season.teams.map((t) => ({ ...t, seasonId: season.id })),
        [s.teams.id],
        ["id"],
      );
      summary.teams += season.teams.length;

      // Replace the Season's children wholesale so rows that vanished from the site vanish here too.
      if (matchIds.length > 0) {
        await tx.delete(s.boxScoreLines).where(inArray(s.boxScoreLines.matchId, matchIds));
        await tx.delete(s.setScores).where(inArray(s.setScores.matchId, matchIds));
      }
      if (phaseIds.length > 0) await tx.delete(s.standings).where(inArray(s.standings.phaseId, phaseIds));
      if (teamIds.length > 0) await tx.delete(s.rosterEntries).where(inArray(s.rosterEntries.teamId, teamIds));

      await upsert(
        tx,
        s.phases,
        season.phases.map((p) => ({ id: p.id, seasonId: season.id, kind: p.kind, name: p.name, position: p.position })),
        [s.phases.id],
        ["id"],
      );
      await upsert(
        tx,
        s.rounds,
        season.phases.flatMap((p) => p.rounds.map((r) => ({ id: r.id, phaseId: p.id, position: r.position, label: r.label }))),
        [s.rounds.id],
        ["id"],
      );
      await upsert(
        tx,
        s.matches,
        season.matches.map(({ sets: _sets, startsAt, ...m }) => ({ ...m, seasonId: season.id, startsAt: new Date(startsAt) })),
        [s.matches.id],
        ["id"],
      );
      summary.matches += season.matches.length;

      const setRows = season.matches.flatMap((m) => m.sets.map((set) => ({ ...set, matchId: m.id })));
      for (const part of chunks(setRows)) await tx.insert(s.setScores).values(part);
      summary.setScores += setRows.length;

      for (const part of chunks(season.boxScoreLines)) await tx.insert(s.boxScoreLines).values(part);
      summary.boxScoreLines += season.boxScoreLines.length;

      for (const part of chunks(season.standings)) await tx.insert(s.standings).values(part);
      summary.standings += season.standings.length;

      for (const part of chunks(season.rosterEntries)) await tx.insert(s.rosterEntries).values(part);
      summary.rosterEntries += season.rosterEntries.length;
    }

    for (const part of chunks(parsed.sourceRefs)) {
      await tx
        .insert(s.sourceRefs)
        .values(part.map((ref) => ({ ...ref, leagueId: parsed.league.id })))
        .onConflictDoUpdate({
          target: [s.sourceRefs.entityType, s.sourceRefs.entityId, s.sourceRefs.sourceUrl],
          set: { sourceId: sql`excluded.source_id`, leagueId: sql`excluded.league_id` },
        });
    }
  });

  return summary;
}
