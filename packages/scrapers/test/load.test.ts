import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, schema, type DatabaseHandle } from "@courtside/db";
import { loadLeague } from "../src/load";
import type { ParsedLeague, ParsedMatch } from "../src/model";
import { checkSeasons, formatReport } from "../src/runChecks";

function match(league: string, n: number, roundId: string, phaseId: string): ParsedMatch {
  return {
    id: `${league}-m${n}`,
    slug: `2025-11-19-alpha-beta`,
    phaseId,
    roundId,
    homeTeamId: `${league}-alpha-2025-26`,
    awayTeamId: `${league}-beta-2025-26`,
    startsAt: "2025-11-19T16:30:00.000Z",
    venueName: "Hall",
    venueCity: "City",
    attendance: 1000,
    mvpPlayerId: `${league}-p1`,
    leagueMatchNumber: "031",
    status: "finished",
    homeSetsWon: 3,
    awaySetsWon: 0,
    sets: [
      { setNumber: 1, homePoints: 25, awayPoints: 20, durationMinutes: 24 },
      { setNumber: 2, homePoints: 25, awayPoints: 22, durationMinutes: 26 },
      { setNumber: 3, homePoints: 25, awayPoints: 23, durationMinutes: 28 },
    ],
  };
}

/** A small League: two Clubs, one Player, a regular season with two Rounds and a play-off with one. */
function makeLeague(league: string): ParsedLeague {
  const season = `${league}-2025-26`;
  const regular = `${season}-regular`;
  const playoffs = `${season}-playoffs`;
  return {
    league: { id: league, name: `League ${league}`, country: "PL", timeZone: "Europe/Warsaw", organiser: null, websiteUrl: null },
    clubs: [
      { id: `${league}-alpha`, slug: "alpha", name: "Alpha" },
      { id: `${league}-beta`, slug: "beta", name: "Beta" },
    ],
    players: [{ id: `${league}-p1`, slug: "jan-kowalski", fullName: "Jan Kowalski", birthDate: "1996-05-24", heightCm: 198, nationality: null }],
    seasons: [
      {
        id: season,
        label: "2025-26",
        phases: [
          { id: regular, kind: "regular", name: "Regular season", position: 1, rounds: [{ id: `${regular}-r01`, position: 1, label: "Kolejka 1" }, { id: `${regular}-r02`, position: 2, label: "Kolejka 2" }] },
          { id: playoffs, kind: "playoffs", name: "Play-off", position: 2, rounds: [{ id: `${playoffs}-r01`, position: 1, label: "Final" }] },
        ],
        teams: [
          { id: `${league}-alpha-2025-26`, clubId: `${league}-alpha`, name: "Sponsor Alpha", logoUrl: null },
          { id: `${league}-beta-2025-26`, clubId: `${league}-beta`, name: "Beta", logoUrl: "https://example.test/beta.png" },
        ],
        rosterEntries: [{ teamId: `${league}-alpha-2025-26`, playerId: `${league}-p1`, shirtNumber: 7, position: "setter" }],
        matches: [match(league, 1, `${regular}-r01`, regular), match(league, 2, `${regular}-r02`, regular), match(league, 3, `${playoffs}-r01`, playoffs)],
        standings: [
          { phaseId: regular, teamId: `${league}-alpha-2025-26`, position: 1, played: 2, won: 2, lost: 0, setsWon: 6, setsLost: 0, pointsWon: 150, pointsLost: 130, tablePoints: 6 },
          { phaseId: regular, teamId: `${league}-beta-2025-26`, position: 2, played: 2, won: 0, lost: 2, setsWon: 0, setsLost: 6, pointsWon: 130, pointsLost: 150, tablePoints: 0 },
        ],
        boxScoreLines: [1, 2, 3].map((n) => ({
          matchId: `${league}-m${n}`,
          playerId: `${league}-p1`,
          teamId: `${league}-alpha-2025-26`,
          setsPlayed: 3,
          points: 5,
          attackPoints: 0,
          aces: 0,
          blocks: 5,
          errors: 0,
          leagueStats: { "Zagrywka Suma": 12, "Atak Skut%": null },
        })),
      },
    ],
    warnings: [],
    sourceRefs: [1, 3].map((n) => ({ entityType: "match" as const, entityId: `${league}-m${n}`, sourceId: String(n), sourceUrl: `https://example.test/${league}/m/${n}` })),
  };
}

describe("loadLeague", () => {
  let handle: DatabaseHandle;
  beforeAll(async () => {
    handle = openDatabase({ databaseUrl: "", pglitePath: "memory://" });
    await handle.migrate();
  });
  afterAll(() => handle.close());

  const parsed = makeLeague("tl");

  it("stores everything and can run again without duplicating rows", async () => {
    const first = await loadLeague(handle.db, parsed);
    const second = await loadLeague(handle.db, parsed);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ clubs: 2, teams: 2, players: 1, rosterEntries: 1, matches: 3, setScores: 9, boxScoreLines: 3, standings: 2 });

    const { db } = handle;
    expect(await db.select().from(schema.matches)).toHaveLength(3);
    expect(await db.select().from(schema.boxScoreLines)).toHaveLength(3);
    expect(await db.select().from(schema.sourceRefs)).toHaveLength(2);
    const [row] = await db.select().from(schema.matches).where(eq(schema.matches.id, "tl-m1"));
    expect(row?.startsAt.toISOString()).toBe("2025-11-19T16:30:00.000Z");
  });

  it("gives matches on the same day between the same clubs distinct slugs", async () => {
    const slugs = (await handle.db.select({ slug: schema.matches.slug }).from(schema.matches)).map((r) => r.slug).sort();
    expect(slugs).toEqual(["2025-11-19-alpha-beta", "2025-11-19-alpha-beta-m2", "2025-11-19-alpha-beta-m3"]);
  });

  it("updates a Team's name when the sponsor changes", async () => {
    const renamed = structuredClone(parsed);
    const team = renamed.seasons[0]?.teams[0];
    if (team) team.name = "New Sponsor Alpha";
    await loadLeague(handle.db, renamed);
    const teams = await handle.db.select().from(schema.teams);
    expect(teams.find((t) => t.id === "tl-alpha-2025-26")?.name).toBe("New Sponsor Alpha");
  });

  it("deletes Matches, Rounds and Phases that vanished, with their sets and Box scores", async () => {
    const shrunk = structuredClone(parsed);
    const season = shrunk.seasons[0];
    if (!season) throw new Error("no season");
    season.matches = season.matches.filter((m) => m.id === "tl-m1");
    season.boxScoreLines = season.boxScoreLines.filter((l) => l.matchId === "tl-m1");
    season.phases = season.phases.filter((p) => p.kind === "regular");
    const regular = season.phases[0];
    if (regular) regular.rounds = regular.rounds.filter((r) => r.position === 1);
    shrunk.sourceRefs = shrunk.sourceRefs.filter((r) => r.entityId === "tl-m1");

    await loadLeague(handle.db, shrunk);
    const { db } = handle;
    expect((await db.select().from(schema.matches)).map((m) => m.id)).toEqual(["tl-m1"]);
    expect(await db.select().from(schema.setScores)).toHaveLength(3);
    expect(await db.select().from(schema.boxScoreLines)).toHaveLength(1);
    expect((await db.select().from(schema.rounds)).map((r) => r.id)).toEqual(["tl-2025-26-regular-r01"]);
    expect((await db.select().from(schema.phases)).map((p) => p.kind)).toEqual(["regular"]);
    expect((await db.select().from(schema.sourceRefs)).map((r) => r.entityId)).toEqual(["tl-m1"]);
  });

  it("does not delete a Season's Matches when a Rosters-only parse of it comes in", async () => {
    const rostersOnly = structuredClone(parsed);
    const season = rostersOnly.seasons[0];
    if (!season) throw new Error("no season");
    season.phases = [];
    season.matches = [];
    season.standings = [];
    season.boxScoreLines = [];
    await loadLeague(handle.db, rostersOnly);
    expect(await handle.db.select().from(schema.matches)).toHaveLength(1);
  });

  it("reports parse warnings as check warnings", async () => {
    const report = await checkSeasons(handle.db, "tl", ["2025-26"], ["Jan Kowalski played Match 5 for \"X\", which cannot be told apart from \"Y\""]);
    const text = formatReport(report);
    expect(report.results.find((r) => r.rule.startsWith("parse:"))?.findings).toHaveLength(1);
    expect(text).toContain("WARN parse: every page and Box score row could be used (1)");
    expect(text).toContain("Jan Kowalski played Match 5");
  });

  it("checks the loaded Season and fails on a Roster below 12", async () => {
    const report = await checkSeasons(handle.db, "tl", ["2025-26"]);
    const text = formatReport(report);
    expect(report.failures).toBeGreaterThan(0);
    expect(text).toContain("FAIL 2025-26: every Team has a Roster of at least 12 Players");
  });
});

describe("loadLeague with two Leagues", () => {
  let handle: DatabaseHandle;
  beforeAll(async () => {
    handle = openDatabase({ databaseUrl: "", pglitePath: "memory://" });
    await handle.migrate();
  });
  afterAll(() => handle.close());

  it("keeps Clubs, Players and Matches of different Leagues apart, even with equal slugs", async () => {
    await loadLeague(handle.db, makeLeague("aa"));
    await loadLeague(handle.db, makeLeague("bb"));
    const { db } = handle;

    const clubs = await db.select().from(schema.clubs);
    expect(clubs).toHaveLength(4);
    expect(clubs.filter((c) => c.leagueId === "aa")).toHaveLength(2);
    expect(clubs.map((c) => c.slug).sort()).toEqual(["alpha", "alpha-bb", "beta", "beta-bb"]);

    const players = await db.select().from(schema.players);
    expect(players.find((p) => p.id === "aa-p1")?.slug).toBe("jan-kowalski");
    expect(players.find((p) => p.id === "bb-p1")?.slug).toBe("jan-kowalski-p1");

    expect(await db.select().from(schema.matches)).toHaveLength(6);
    expect(new Set((await db.select().from(schema.teams)).map((t) => t.id)).size).toBe(4);
  });

  it("never reassigns a slug a Player already has and never moves a Club to another League", async () => {
    // Reload League aa after bb exists, with a Player who happens to want bb's slug and a Club claiming bb.
    const again = makeLeague("aa");
    again.players.push({ id: "aa-p2", slug: "jan-kowalski-p1", fullName: "Jan Kowalski", birthDate: null, heightCm: null, nationality: null });
    await loadLeague(handle.db, again);
    // And bb reloads without anything new: nothing changes.
    await loadLeague(handle.db, makeLeague("bb"));

    const { db } = handle;
    const players = await db.select().from(schema.players);
    expect(players.find((p) => p.id === "aa-p1")?.slug).toBe("jan-kowalski");
    expect(players.find((p) => p.id === "bb-p1")?.slug).toBe("jan-kowalski-p1");
    expect(players.find((p) => p.id === "aa-p2")?.slug).toBe("jan-kowalski-p1-p2");

    const hijack = makeLeague("aa");
    hijack.clubs[0] = { id: "bb-alpha", slug: "alpha", name: "Alpha" };
    await loadLeague(handle.db, hijack);
    const [club] = await db.select().from(schema.clubs).where(eq(schema.clubs.id, "bb-alpha"));
    expect(club?.leagueId).toBe("bb");
  });

  it("keeps a Player's slug when a lower-id Player is missing from a later run", async () => {
    const first = makeLeague("cc");
    first.players = [
      { id: "cc-p1", slug: "marcel-kicinski", fullName: "Marcel Kicinski", birthDate: null, heightCm: null, nationality: null },
      { id: "cc-p9", slug: "marcel-kicinski", fullName: "Marcel Kicinski", birthDate: null, heightCm: null, nationality: null },
    ];
    first.seasons[0]?.rosterEntries.splice(0);
    first.seasons[0]?.boxScoreLines.splice(0);
    first.seasons[0]?.matches.forEach((m) => (m.mvpPlayerId = null));
    await loadLeague(handle.db, first);

    const second = structuredClone(first);
    second.players = second.players.filter((p) => p.id === "cc-p9");
    await loadLeague(handle.db, second);

    const rows = await handle.db.select().from(schema.players).where(eq(schema.players.id, "cc-p9"));
    expect(rows[0]?.slug).toBe("marcel-kicinski-p9");
  });
});
