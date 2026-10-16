import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, schema, type DatabaseHandle } from "@courtside/db";
import { loadLeague } from "../src/load";
import type { ParsedLeague } from "../src/model";
import { checkSeasons, formatReport } from "../src/runChecks";

const parsed: ParsedLeague = {
  league: { id: "tl", name: "Test League", country: "PL", timeZone: "Europe/Warsaw", organiser: null, websiteUrl: null },
  clubs: [
    { id: "alpha", slug: "alpha", name: "Alpha" },
    { id: "beta", slug: "beta", name: "Beta" },
  ],
  players: [{ id: "tl-p1", slug: "jan-kowalski", fullName: "Jan Kowalski", birthDate: "1996-05-24", heightCm: 198, nationality: null }],
  seasons: [
    {
      id: "tl-2025-26",
      label: "2025-26",
      phases: [{ id: "tl-2025-26-regular", kind: "regular", name: "Regular season", position: 1, rounds: [{ id: "r1", position: 1, label: "Kolejka 1" }] }],
      teams: [
        { id: "alpha-2025-26", clubId: "alpha", name: "Sponsor Alpha", logoUrl: null },
        { id: "beta-2025-26", clubId: "beta", name: "Beta", logoUrl: "https://example.test/beta.png" },
      ],
      rosterEntries: [{ teamId: "alpha-2025-26", playerId: "tl-p1", shirtNumber: 7, position: "setter" }],
      matches: [
        {
          id: "tl-m1",
          slug: "2025-11-19-alpha-beta",
          phaseId: "tl-2025-26-regular",
          roundId: "r1",
          homeTeamId: "alpha-2025-26",
          awayTeamId: "beta-2025-26",
          startsAt: "2025-11-19T16:30:00.000Z",
          venueName: "Hall",
          venueCity: "City",
          attendance: 1000,
          mvpPlayerId: "tl-p1",
          leagueMatchNumber: "031",
          status: "finished",
          homeSetsWon: 3,
          awaySetsWon: 0,
          sets: [
            { setNumber: 1, homePoints: 25, awayPoints: 20, durationMinutes: 24 },
            { setNumber: 2, homePoints: 25, awayPoints: 22, durationMinutes: 26 },
            { setNumber: 3, homePoints: 25, awayPoints: 23, durationMinutes: 28 },
          ],
        },
      ],
      standings: [
        { phaseId: "tl-2025-26-regular", teamId: "alpha-2025-26", position: 1, played: 1, won: 1, lost: 0, setsWon: 3, setsLost: 0, pointsWon: 75, pointsLost: 65, tablePoints: 3 },
        { phaseId: "tl-2025-26-regular", teamId: "beta-2025-26", position: 2, played: 1, won: 0, lost: 1, setsWon: 0, setsLost: 3, pointsWon: 65, pointsLost: 75, tablePoints: 0 },
      ],
      boxScoreLines: [
        {
          matchId: "tl-m1",
          playerId: "tl-p1",
          teamId: "alpha-2025-26",
          setsPlayed: 3,
          points: 5,
          attackPoints: 0,
          aces: 0,
          blocks: 5,
          errors: 0,
          leagueStats: { "Zagrywka Suma": 12, "Atak Skut%": null },
        },
      ],
    },
  ],
  sourceRefs: [{ entityType: "match", entityId: "tl-m1", sourceId: "1", sourceUrl: "https://example.test/m/1" }],
};

describe("loadLeague", () => {
  let handle: DatabaseHandle;
  beforeAll(async () => {
    handle = openDatabase({ databaseUrl: "", pglitePath: "memory://" });
    await handle.migrate();
  });
  afterAll(() => handle.close());

  it("stores everything and can run again without duplicating rows", async () => {
    const first = await loadLeague(handle.db, parsed);
    const second = await loadLeague(handle.db, parsed);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ clubs: 2, teams: 2, players: 1, rosterEntries: 1, matches: 1, setScores: 3, boxScoreLines: 1, standings: 2 });

    const { db } = handle;
    expect(await db.select().from(schema.matches)).toHaveLength(1);
    expect(await db.select().from(schema.setScores)).toHaveLength(3);
    expect(await db.select().from(schema.boxScoreLines)).toHaveLength(1);
    expect(await db.select().from(schema.sourceRefs)).toHaveLength(1);
    const [match] = await db.select().from(schema.matches);
    expect(match?.startsAt.toISOString()).toBe("2025-11-19T16:30:00.000Z");
  });

  it("updates a Team's name when the sponsor changes", async () => {
    const renamed: ParsedLeague = structuredClone(parsed);
    const team = renamed.seasons[0]?.teams[0];
    if (team) team.name = "New Sponsor Alpha";
    await loadLeague(handle.db, renamed);
    const teams = await handle.db.select().from(schema.teams);
    expect(teams.find((t) => t.id === "alpha-2025-26")?.name).toBe("New Sponsor Alpha");
  });

  it("checks the loaded Season and fails on a Roster below 12", async () => {
    const report = await checkSeasons(handle.db, "tl", ["2025-26"]);
    const text = formatReport(report);
    expect(report.failures).toBeGreaterThan(0);
    expect(text).toContain("FAIL 2025-26: every Team has a Roster of at least 12 Players");
    expect(text).toContain("ok   2025-26: loaded Standings agree with Standings computed from Matches");
    expect(text).toContain("ok   2025-26: finished Matches have 3-5 valid sets and the winner won 3");
  });
});
