import { describe, expect, it } from "vitest";
import {
  computeStandings,
  isValidSet,
  matchSetsRule,
  regularSeasonFormatRule,
  rosterRule,
  standingsRule,
  type CheckMatch,
  type CheckSeason,
  type CheckSet,
} from "../src/checks";

const set = (setNumber: number, homePoints: number, awayPoints: number): CheckSet => ({ setNumber, homePoints, awayPoints });

function match(id: string, home: string, away: string, sets: CheckSet[], extra: Partial<CheckMatch> = {}): CheckMatch {
  const homeWon = sets.filter((s) => s.homePoints > s.awayPoints).length;
  return {
    id,
    phaseId: "p",
    roundId: "r1",
    homeTeamId: home,
    awayTeamId: away,
    status: "finished",
    homeSetsWon: homeWon,
    awaySetsWon: sets.length - homeWon,
    sets,
    boxScoreTeamIds: [home, away],
    ...extra,
  };
}

const threeZero = [set(1, 25, 20), set(2, 25, 22), set(3, 25, 23)];
const season = (matches: CheckMatch[], overrides: Partial<CheckSeason> = {}): CheckSeason => ({
  label: "2025-26",
  teams: [],
  phases: [{ id: "p", kind: "regular", name: "Regular season", roundCount: 2 }],
  matches,
  standings: new Map(),
  ...overrides,
});

describe("isValidSet", () => {
  it.each([
    [1, 25, 20, true],
    [1, 25, 23, true],
    [2, 28, 26, true],
    [3, 30, 28, true],
    [1, 25, 24, false],
    [1, 24, 22, false],
    [1, 27, 24, false],
    [1, 25, 25, false],
    [5, 15, 13, true],
    [5, 15, 14, false],
    [5, 17, 15, true],
    [5, 25, 20, false],
  ])("set %i ending %i:%i is valid: %s", (n, home, away, valid) => {
    expect(isValidSet(set(n, home, away))).toBe(valid);
    expect(isValidSet(set(n, away, home))).toBe(valid);
  });
});

describe("rosterRule", () => {
  it("flags Teams with fewer than 12 Players", () => {
    const result = rosterRule(
      season([], {
        teams: [
          { id: "a", name: "A", rosterSize: 12 },
          { id: "b", name: "B", rosterSize: 11 },
        ],
      }),
    );
    expect(result.findings.map((f) => f.message)).toEqual(["B has 11 Players on its Roster, expected at least 12"]);
  });
});

describe("matchSetsRule", () => {
  it("accepts 3-0, 3-1 and 3-2 matches", () => {
    const result = matchSetsRule(
      season([
        match("m1", "a", "b", threeZero),
        match("m2", "a", "b", [set(1, 25, 20), set(2, 20, 25), set(3, 25, 20), set(4, 25, 20)]),
        match("m3", "a", "b", [set(1, 25, 20), set(2, 20, 25), set(3, 25, 20), set(4, 20, 25), set(5, 16, 14)]),
      ]),
    );
    expect(result.findings).toEqual([]);
  });

  it("flags a match with two sets", () => {
    const result = matchSetsRule(season([match("m1", "a", "b", [set(1, 25, 20), set(2, 25, 20)])]));
    expect(result.findings.some((f) => f.message.includes("2 sets"))).toBe(true);
  });

  it("flags a set without a 2-point margin", () => {
    const result = matchSetsRule(season([match("m1", "a", "b", [set(1, 25, 24), set(2, 25, 20), set(3, 25, 20)])]));
    expect(result.findings.map((f) => f.message)).toEqual(["Match m1: set 1 ended 25:24"]);
  });

  it("flags a fifth set played to 25", () => {
    const sets = [set(1, 25, 20), set(2, 20, 25), set(3, 25, 20), set(4, 20, 25), set(5, 25, 20)];
    expect(matchSetsRule(season([match("m1", "a", "b", sets)])).findings).toHaveLength(1);
  });

  it("flags set scores that disagree with the Match result", () => {
    const result = matchSetsRule(season([match("m1", "a", "b", threeZero, { homeSetsWon: 2, awaySetsWon: 1 })]));
    expect(result.findings.some((f) => f.message.includes("set scores give 3:0"))).toBe(true);
  });

  it("flags a Match that nobody won with 3 sets", () => {
    const sets = [set(1, 25, 20), set(2, 20, 25), set(3, 25, 20), set(4, 20, 25)];
    const result = matchSetsRule(season([match("m1", "a", "b", sets)]));
    expect(result.findings.some((f) => f.message.includes("no winner"))).toBe(true);
  });

  it("ignores Matches that have not been played", () => {
    const result = matchSetsRule(season([match("m1", "a", "b", [], { status: "scheduled", homeSetsWon: null, awaySetsWon: null })]));
    expect(result.findings).toEqual([]);
  });
});

describe("regularSeasonFormatRule", () => {
  const four = ["a", "b", "c", "d"];
  // Double round robin of 4 Teams: 6 rounds, 2 Matches each, 12 Matches.
  const pairs = four.flatMap((h) => four.filter((a) => a !== h).map((a) => [h, a] as const));
  const full = pairs.map(([h, a], i) => match(`m${i}`, h, a, threeZero, { roundId: `r${Math.floor(i / 2) + 1}` }));
  const phases = [{ id: "p", kind: "regular", name: "Regular season", roundCount: 6 }];

  it("accepts a complete double round robin", () => {
    expect(regularSeasonFormatRule(season(full, { phases })).findings).toEqual([]);
  });

  it("flags a missing Match", () => {
    const result = regularSeasonFormatRule(season(full.slice(1), { phases }));
    expect(result.findings.some((f) => f.message.includes("11 Matches, expected 4 Teams x 6 Rounds / 2 = 12"))).toBe(true);
  });

  it("derives 182 Matches from 14 Teams and 26 Rounds", () => {
    const teams = Array.from({ length: 14 }, (_, i) => `t${i}`);
    const all = teams.flatMap((h) => teams.filter((a) => a !== h).map((a) => [h, a] as const));
    expect(all).toHaveLength(182);
    const matches = all.map(([h, a], i) => match(`m${i}`, h, a, threeZero, { roundId: `r${(i % 26) + 1}` }));
    const result = regularSeasonFormatRule(season(matches, { phases: [{ id: "p", kind: "regular", name: "R", roundCount: 26 }] }));
    // Round sizes are uneven in this synthetic layout; only the totals matter here.
    expect(result.findings.some((f) => f.message.includes("Matches, expected 14 Teams"))).toBe(false);
    expect(result.findings.some((f) => f.message.includes("Rounds, expected"))).toBe(false);
  });
});

describe("computeStandings", () => {
  const matches = [
    match("m1", "a", "b", threeZero),
    match("m2", "b", "a", [set(1, 25, 20), set(2, 20, 25), set(3, 25, 20), set(4, 20, 25), set(5, 15, 13)]),
    match("m3", "a", "c", [set(1, 25, 20), set(2, 20, 25), set(3, 25, 20), set(4, 25, 20)]),
  ];

  it("gives 3 points for 3-0 and 3-1 wins, 2 for a 3-2 win and 1 for a 3-2 loss", () => {
    const rows = new Map(computeStandings(matches, ["a", "b", "c"]).map((r) => [r.teamId, r]));
    expect(rows.get("a")).toMatchObject({ played: 3, won: 2, lost: 1, tablePoints: 3 + 1 + 3, setsWon: 3 + 2 + 3, setsLost: 0 + 3 + 1 });
    expect(rows.get("b")).toMatchObject({ played: 2, won: 1, lost: 1, tablePoints: 0 + 2 });
    expect(rows.get("c")).toMatchObject({ played: 1, won: 0, lost: 1, tablePoints: 0 });
  });

  it("sums points from the set scores and ranks by table points", () => {
    const rows = computeStandings(matches, ["a", "b", "c"]);
    expect(rows.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    expect(rows[0]).toMatchObject({ position: 1, pointsWon: 75 + 103 + 95, pointsLost: 65 + 105 + 85 });
  });

  it("breaks a tie in table points by wins", () => {
    const fiveHome = [set(1, 25, 20), set(2, 20, 25), set(3, 25, 20), set(4, 20, 25), set(5, 15, 13)];
    const fiveAway = [set(1, 20, 25), set(2, 25, 20), set(3, 20, 25), set(4, 25, 20), set(5, 13, 15)];
    const rows = computeStandings(
      [
        match("m1", "x", "z", fiveHome),
        match("m2", "x", "w", fiveHome),
        match("m3", "y", "z", threeZero),
        match("m4", "y", "w", fiveAway),
      ],
      ["y", "x", "z", "w"],
    );
    const byTeam = new Map(rows.map((r) => [r.teamId, r]));
    expect(byTeam.get("x")?.tablePoints).toBe(4);
    expect(byTeam.get("y")?.tablePoints).toBe(4);
    expect(rows.slice(0, 2).map((r) => r.teamId)).toEqual(["x", "y"]);
  });
});

describe("standingsRule", () => {
  const matches = [match("m1", "a", "b", threeZero)];
  const base = computeStandings(matches, ["a", "b"]);

  it("passes when loaded Standings equal the computed ones", () => {
    const result = standingsRule(season(matches, { standings: new Map([["p", base]]), teams: [{ id: "a", name: "A", rosterSize: 12 }] }));
    expect(result.findings).toEqual([]);
  });

  it("names the Team and the figure that differs", () => {
    const wrong = base.map((r) => (r.teamId === "a" ? { ...r, tablePoints: 2 } : r));
    const result = standingsRule(season(matches, { standings: new Map([["p", wrong]]), teams: [{ id: "a", name: "A", rosterSize: 12 }] }));
    expect(result.findings.map((f) => f.message)).toEqual(["A: tablePoints 2 vs computed 3"]);
  });

  it("fails when nothing is loaded", () => {
    expect(standingsRule(season(matches)).findings).toHaveLength(1);
  });
});
