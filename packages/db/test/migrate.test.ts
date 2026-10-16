import { afterAll, describe, expect, it } from "vitest";
import { openDatabase, schema } from "../src";

describe("migrations", () => {
  const handle = openDatabase({ databaseUrl: "", pglitePath: "memory://" });
  afterAll(() => handle.close());

  it("create every table and accept a Box score with league stats", async () => {
    await handle.migrate();
    const { db } = handle;
    await db.insert(schema.leagues).values({ id: "l", name: "L", country: "PL", timeZone: "Europe/Warsaw" });
    await db.insert(schema.seasons).values({ id: "s", leagueId: "l", label: "2025-26" });
    await db.insert(schema.phases).values({ id: "p", seasonId: "s", kind: "regular", name: "P", position: 1 });
    await db.insert(schema.rounds).values({ id: "r", phaseId: "p", position: 1, label: "R1" });
    await db.insert(schema.clubs).values([
      { id: "a", leagueId: "l", slug: "a", name: "A" },
      { id: "b", leagueId: "l", slug: "b", name: "B" },
    ]);
    await db.insert(schema.teams).values([
      { id: "a-s", clubId: "a", seasonId: "s", name: "A Sponsor" },
      { id: "b-s", clubId: "b", seasonId: "s", name: "B" },
    ]);
    await db.insert(schema.players).values({ id: "x", slug: "x", fullName: "X" });
    await db.insert(schema.matches).values({
      id: "m",
      slug: "m",
      seasonId: "s",
      phaseId: "p",
      roundId: "r",
      homeTeamId: "a-s",
      awayTeamId: "b-s",
      startsAt: new Date("2025-11-19T16:30:00Z"),
      status: "finished",
      homeSetsWon: 1,
      awaySetsWon: 3,
    });
    await db.insert(schema.boxScoreLines).values({
      matchId: "m",
      playerId: "x",
      teamId: "a-s",
      setsPlayed: 4,
      points: 10,
      attackPoints: 8,
      aces: 1,
      blocks: 1,
      errors: 3,
      leagueStats: { "Zagrywka Suma": 12, "Atak Skut%": null },
    });
    const [line] = await db.select().from(schema.boxScoreLines);
    expect(line?.leagueStats).toEqual({ "Zagrywka Suma": 12, "Atak Skut%": null });
  });
});
