import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { schema, type Database } from "@courtside/db";
import type { ParsedLeague } from "./model";
import { resolveSlugs, withoutLeaguePrefix } from "./slugs";

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

/**
 * Inserts rows, updating the ones that exist. `keep` names columns an existing row
 * keeps whatever the new data says (its id, its slug, the League it belongs to).
 */
async function upsert<T extends PgTable>(
  db: Database,
  table: T,
  rows: T["$inferInsert"][],
  target: PgColumn[],
  keep: string[],
): Promise<void> {
  const columns = getTableColumns(table);
  for (const part of chunks(rows)) {
    await db
      .insert(table)
      .values(part)
      .onConflictDoUpdate({ target, set: overwrite(columns, keep) });
  }
}

async function deleteWhereIn(db: Database, column: PgColumn, ids: string[]): Promise<void> {
  for (const part of chunks(ids)) await db.delete(column.table as PgTable).where(inArray(column, part));
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

/**
 * Stores everything in `parsed` in one transaction.
 *
 * Clubs, Players, Teams, Matches, Phases and Rounds are upserted by id; an existing
 * row keeps its slug (and a Club its League). For a Season that comes with Phases,
 * the load is also a replacement: Matches, Rounds and Phases of that Season that the
 * parse no longer contains are deleted (with their sets, Box scores and Standings),
 * and sets, Box scores, Standings and Rosters are rewritten. A Season without Phases
 * (Rosters only) never deletes Matches, so loading it cannot erase a Season loaded in full.
 */
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
  const leagueId = parsed.league.id;

  await db.transaction(async (tx) => {
    await upsert(tx, s.leagues, [{ ...parsed.league }], [s.leagues.id], ["id"]);
    await upsert(
      tx,
      s.seasons,
      parsed.seasons.map((season) => ({ id: season.id, leagueId, label: season.label })),
      [s.seasons.id],
      ["id", "leagueId"],
    );

    // Slugs are unique across every League in the table, so they are settled against what is stored.
    const slugsOf = async (table: typeof s.clubs | typeof s.players | typeof s.matches) =>
      new Map((await tx.select({ id: table.id, slug: table.slug }).from(table)).map((r) => [r.id, r.slug]));

    const clubSlugs = resolveSlugs(
      parsed.clubs.map((c) => ({ id: c.id, slug: c.slug, suffix: leagueId })),
      await slugsOf(s.clubs),
    );
    await upsert(
      tx,
      s.clubs,
      parsed.clubs.map((club) => ({ ...club, slug: clubSlugs.get(club.id) ?? club.slug, leagueId })),
      [s.clubs.id],
      ["id", "slug", "leagueId"],
    );

    const playerSlugs = resolveSlugs(
      parsed.players.map((p) => ({ id: p.id, slug: p.slug, suffix: withoutLeaguePrefix(p.id, leagueId) })),
      await slugsOf(s.players),
    );
    await upsert(
      tx,
      s.players,
      parsed.players.map((p) => ({ ...p, slug: playerSlugs.get(p.id) ?? p.slug })),
      [s.players.id],
      ["id", "slug"],
    );

    const matchSlugs = resolveSlugs(
      parsed.seasons.flatMap((season) =>
        season.matches.map((m) => ({ id: m.id, slug: m.slug, suffix: withoutLeaguePrefix(m.id, leagueId) })),
      ),
      await slugsOf(s.matches),
    );

    for (const season of parsed.seasons) {
      const fullSeason = season.phases.length > 0;
      const teamIds = season.teams.map((t) => t.id);
      const phaseIds = season.phases.map((p) => p.id);
      const roundIds = season.phases.flatMap((p) => p.rounds.map((r) => r.id));
      const matchIds = season.matches.map((m) => m.id);

      await upsert(
        tx,
        s.teams,
        season.teams.map((t) => ({ ...t, seasonId: season.id })),
        [s.teams.id],
        ["id", "clubId", "seasonId"],
      );
      summary.teams += season.teams.length;

      const storedPhaseIds = (await tx.select({ id: s.phases.id }).from(s.phases).where(eq(s.phases.seasonId, season.id))).map((r) => r.id);
      const storedMatchIds = (await tx.select({ id: s.matches.id }).from(s.matches).where(eq(s.matches.seasonId, season.id))).map((r) => r.id);

      // Children first. A full Season clears all its stored Matches and Phases, not only the parsed ones,
      // so what vanished from the site vanishes here too.
      const clearMatchIds = fullSeason ? [...new Set([...storedMatchIds, ...matchIds])] : matchIds;
      await deleteWhereIn(tx, s.boxScoreLines.matchId, clearMatchIds);
      await deleteWhereIn(tx, s.setScores.matchId, clearMatchIds);
      if (fullSeason) {
        const goneMatchIds = storedMatchIds.filter((id) => !matchIds.includes(id));
        await deleteWhereIn(tx, s.matches.id, goneMatchIds);
        for (const part of chunks(goneMatchIds)) {
          await tx.delete(s.sourceRefs).where(and(eq(s.sourceRefs.entityType, "match"), inArray(s.sourceRefs.entityId, part)));
        }
        await deleteWhereIn(tx, s.standings.phaseId, [...new Set([...storedPhaseIds, ...phaseIds])]);
      }
      await deleteWhereIn(tx, s.rosterEntries.teamId, teamIds);

      await upsert(
        tx,
        s.phases,
        season.phases.map((p) => ({ id: p.id, seasonId: season.id, kind: p.kind, name: p.name, position: p.position })),
        [s.phases.id],
        ["id", "seasonId"],
      );
      await upsert(
        tx,
        s.rounds,
        season.phases.flatMap((p) => p.rounds.map((r) => ({ id: r.id, phaseId: p.id, position: r.position, label: r.label }))),
        [s.rounds.id],
        ["id", "phaseId"],
      );
      await upsert(
        tx,
        s.matches,
        season.matches.map(({ sets: _sets, startsAt, ...m }) => ({
          ...m,
          slug: matchSlugs.get(m.id) ?? m.slug,
          seasonId: season.id,
          startsAt: new Date(startsAt),
        })),
        [s.matches.id],
        ["id", "slug", "seasonId"],
      );
      summary.matches += season.matches.length;

      if (fullSeason) {
        // Matches are gone by now, so Rounds and Phases nothing refers to can go.
        const storedRoundIds = (
          await tx.select({ id: s.rounds.id }).from(s.rounds).where(inArray(s.rounds.phaseId, [...new Set([...storedPhaseIds, ...phaseIds])]))
        ).map((r) => r.id);
        await deleteWhereIn(tx, s.rounds.id, storedRoundIds.filter((id) => !roundIds.includes(id)));
        await deleteWhereIn(tx, s.phases.id, storedPhaseIds.filter((id) => !phaseIds.includes(id)));
      }

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

    const refs = new Map(parsed.sourceRefs.map((ref) => [`${ref.entityType}|${ref.entityId}|${ref.sourceUrl}`, ref]));
    for (const part of chunks([...refs.values()])) {
      await tx
        .insert(s.sourceRefs)
        .values(part.map((ref) => ({ ...ref, leagueId })))
        .onConflictDoUpdate({
          target: [s.sourceRefs.entityType, s.sourceRefs.entityId, s.sourceRefs.sourceUrl],
          set: { sourceId: sql`excluded.source_id`, leagueId: sql`excluded.league_id` },
        });
    }
  });

  return summary;
}
