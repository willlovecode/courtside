import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clubForCode, clubsByCode } from "../src/superlega/config";
import { competitionsOf, playerKeysOnMatchPage, playerKeysOnTeamPage } from "../src/superlega/discover";
import { mapBoxScore, mapPosition } from "../src/superlega/boxScore";
import { parseCell, parseMatchPage } from "../src/superlega/matchPage";
import { parsePlayerPage } from "../src/superlega/playerPage";
import { giornataName, parseBracketMatchIds, parseResultsPage } from "../src/superlega/resultsPage";
import { parseStandings } from "../src/superlega/standingsPage";
import { parseTeamPage } from "../src/superlega/teamPage";
import { localToUtc, parseSlashDateTime } from "../src/time";

const fixture = (name: string) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "superlega", name), "utf8");

describe("results pages", () => {
  const root = parseResultsPage(fixture("results-root.html"));
  const round = parseResultsPage(fixture("results-ritorno-1.html"));

  it("finds the SuperLega competitions by name, not by id", () => {
    expect(competitionsOf(root)).toEqual({ regular: "974", playoffs: "991", placement: "995" });
    // Coppa Italia and Supercoppa are listed but not picked.
    expect(root.campionati.map((c) => c.value)).toContain("988");
  });

  it("lists the phases and rounds from the selectors", () => {
    expect(round.fasi.map((f) => f.label)).toEqual(["Andata", "Ritorno"]);
    expect(round.giornate).toHaveLength(11);
    expect(round.giornate[0]).toEqual({ value: "8265", label: "1ª Giornata (21/12/2025)", selected: true });
    expect(giornataName("1ª Giornata (21/12/2025)")).toBe("1ª Giornata");
  });

  it("reads the Matches of a round, home team first, and ignores the embedded standings", () => {
    expect(round.results).toHaveLength(6);
    expect(round.results[0]).toEqual({
      matchSiteId: "39283",
      homeTeamSiteId: "6710",
      homeName: "Sir Susa Scai Perugia",
      awayTeamSiteId: "6708",
      awayName: "Vero Volley Monza",
      setsHome: 3,
      setsAway: 1,
    });
    expect(round.results[2]).toMatchObject({ matchSiteId: "39285", setsHome: 3, setsAway: 1, homeName: "Valsa Group Modena" });
    expect(round.results[3]).toMatchObject({ homeName: "Sonepar Padova", setsHome: 0, setsAway: 3 });
  });

  it("reads the Matches of the play-off brackets", () => {
    const playoffs = parseBracketMatchIds(fixture("bracket-playoffs.html"));
    const placement = parseBracketMatchIds(fixture("bracket-placement.html"));
    expect(playoffs).toHaveLength(25);
    expect(playoffs.slice(0, 3)).toEqual(["40122", "40126", "40130"]);
    expect(placement).toHaveLength(12);
  });
});

describe("standings", () => {
  const rows = parseStandings(fixture("standings.html"));

  it("reads 12 Teams in table order with their Club codes", () => {
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.position)).toEqual([...Array(12).keys()].map((i) => i + 1));
    expect(rows.every((r) => r.played === 22)).toBe(true);
  });

  it("reads one row in full, thousands separators included", () => {
    expect(rows[0]).toEqual({
      position: 1,
      code: "BASTIA",
      name: "Sir Susa Scai Perugia",
      tablePoints: 58,
      played: 22,
      won: 20,
      lost: 2,
      setsWon: 63,
      setsLost: 20,
      pointsWon: 1960,
      pointsLost: 1686,
    });
  });

  it("only meets Clubs the config knows", () => {
    for (const row of rows) expect(() => clubForCode(row.code ?? "")).not.toThrow();
  });
});

describe("match page", () => {
  const page = parseMatchPage(fixture("match-39343.html"));

  it("reads the header, teams and result", () => {
    expect(page).toMatchObject({
      season: "2025/2026",
      competition: "Regular Season SuperLega Credem Banca",
      stage: "11ª Giornata Ritorno",
      matchNumber: "127",
      home: { code: "TN-ITAS", name: "Itas Trentino", setsWon: 3 },
      away: { code: "CIS-VOLLEY", name: "Cisterna Volley", setsWon: 0 },
    });
  });

  it("reads the facts: time, attendance with its thousands separator, venue and MVP", () => {
    expect(page).toMatchObject({
      date: "25/2/2026",
      time: "20:30",
      attendance: 3293,
      venueName: "BTS Arena",
      venueCity: "Trento",
      mvp: { playerKey: "FAU-THE", name: "Faure Theo" },
    });
    const starts = localToUtc(parseSlashDateTime(page.date ?? "", page.time ?? ""), "Europe/Rome");
    expect(starts.toISOString()).toBe("2026-02-25T19:30:00.000Z");
  });

  it("reads the played sets and drops the 0-0 rows of sets that were not played", () => {
    expect(page.sets).toEqual([
      { setNumber: 1, durationMinutes: 22, homePoints: 25, awayPoints: 15 },
      { setNumber: 2, durationMinutes: 27, homePoints: 25, awayPoints: 19 },
      { setNumber: 3, durationMinutes: 26, homePoints: 25, awayPoints: 15 },
    ]);
  });

  it("reads one Box score per team with every row's 16 stat columns", () => {
    expect(page.boxScores.map((b) => [b.teamName, b.rows.length, b.totalPoints])).toEqual([
      ["Itas Trentino", 14, 56],
      ["Cisterna Volley", 13, 32],
    ]);
    const faure = page.boxScores[0]?.rows.find((r) => r.playerKey === "FAU-THE");
    expect(Object.keys(faure?.stats ?? {})).toEqual([
      "Voto",
      "Punti Tot",
      "Punti BP",
      "Punti VP",
      "Battuta Tot",
      "Battuta Err",
      "Battuta Pt",
      "Ricezione Tot",
      "Ricezione Err",
      "Ricezione Pos%",
      "Ricezione Prf%",
      "Attacco Tot",
      "Attacco Err",
      "Attacco Mur",
      "Attacco Pt",
      "Attacco Pt%",
      "Muro Pt",
    ]);
  });

  it("adds up: the players' points equal the team total", () => {
    for (const box of page.boxScores) {
      expect(box.rows.reduce((n, r) => n + (r.stats["Punti Tot"] ?? 0), 0)).toBe(box.totalPoints);
    }
  });

  it("strips the libero mark from names and finds the Player keys", () => {
    const names = page.boxScores[0]?.rows.map((r) => r.name) ?? [];
    expect(names).toContain("Laurenzano Gabriele");
    expect(names.some((n) => n.includes("(L)"))).toBe(false);
    expect(playerKeysOnMatchPage(fixture("match-39343.html"))).toContain("BIS-ALE-05");
  });

  it("reads a play-off game: the stage names the round", () => {
    const playoff = parseMatchPage(fixture("match-40122.html"));
    expect(playoff).toMatchObject({
      competition: "Play Off SuperLega Credem Banca",
      stage: "Gara 1 Quarti",
      matchNumber: "1401",
      home: { name: "Sir Susa Scai Perugia" },
      away: { name: "Vero Volley Monza" },
    });
  });
});

describe("Box score core mapping", () => {
  const page = parseMatchPage(fixture("match-39343.html"));
  const row = (key: string) => {
    const found = page.boxScores.flatMap((b) => b.rows).find((r) => r.playerKey === key);
    if (!found) throw new Error(`no row for ${key}`);
    return found;
  };

  it("maps Faure: 3 sets, 15 points, 13 from attacks, 1 ace, 1 block, 3 service errors", () => {
    expect(mapBoxScore(row("FAU-THE"))?.core).toEqual({ setsPlayed: 3, points: 15, attackPoints: 13, aces: 1, blocks: 1, errors: 3 });
  });

  it("adds the four error columns: Ramon has 3 service, 1 attack and 1 blocked-attack error", () => {
    const mapped = mapBoxScore(row("RAM-JOR-99"));
    expect(mapped?.core).toEqual({ setsPlayed: 3, points: 13, attackPoints: 8, aces: 4, blocks: 1, errors: 5 });
    expect(mapped?.leagueStats).toMatchObject({ "Battuta Err": 3, "Attacco Err": 1, "Attacco Mur": 1, "Ricezione Pos%": 47, "Attacco Pt%": 44 });
  });

  it("keeps the SET cells and the unmapped columns in leagueStats, and the mapped ones only in the core", () => {
    const { leagueStats } = mapBoxScore(row("RAM-JOR-99")) ?? { leagueStats: {} };
    expect(leagueStats).toMatchObject({ "Set 1": 3, "Set 2": 2, "Set 3": 3, "Set 4": null, "Punti BP": 8, "Punti VP": 6, "Battuta Tot": 16 });
    for (const mapped of ["Punti Tot", "Attacco Pt", "Battuta Pt", "Muro Pt"]) expect(leagueStats).not.toHaveProperty(mapped);
  });

  it("counts a substitute (*) as having played the set", () => {
    expect(mapBoxScore(row("LAU-GAB-03"))?.core.setsPlayed).toBe(3);
  });

  it("makes no line for a Player who never got on court", () => {
    expect(mapBoxScore(row("BIS-ALE-05"))).toBeNull();
  });
});

describe("mapBoxScore", () => {
  const stats = {
    Voto: null,
    "Punti Tot": 20,
    "Battuta Err": 2,
    "Battuta Pt": 3,
    "Ricezione Err": 4,
    "Attacco Err": 5,
    "Attacco Mur": 7,
    "Attacco Pt": 11,
    "Muro Pt": 6,
  };

  it("adds service, reception and attack errors and attacks blocked", () => {
    const mapped = mapBoxScore({ playerKey: "X", name: "X", shirtNumber: 1, setCells: [1, "*", null, null, null], stats });
    expect(mapped?.core).toEqual({ setsPlayed: 2, points: 20, attackPoints: 11, aces: 3, blocks: 6, errors: 18 });
  });

  it("refuses a page whose columns changed", () => {
    expect(() =>
      mapBoxScore({ playerKey: "X", name: "X", shirtNumber: 1, setCells: [1, null, null, null, null], stats: { "Punti Tot": 1 } }),
    ).toThrow(/Attacco Pt/);
  });
});

describe("parseCell", () => {
  it.each([
    ["3.293", 3293],
    ["47%", 47],
    ["-1", -1],
    [".", null],
    ["", null],
    [" ", null],
    ["1.960", 1960],
  ])("%j reads as %j", (raw, expected) => {
    expect(parseCell(raw)).toBe(expected);
  });

  it("rejects text", () => {
    expect(() => parseCell("abc")).toThrow();
  });
});

describe("team page", () => {
  const page = parseTeamPage(fixture("team-6707.html"));

  it("reads the Season's Team name, Club code, logo and Roster", () => {
    expect(page.name).toBe("Itas Trentino");
    expect(page.code).toBe("TN-ITAS");
    expect(page.logoUrl).toContain("Proc=LogoSquadra");
    expect(page.logoUrl).toContain("Key=6707");
    expect(page.roster).toHaveLength(15);
    expect(page.roster[0]).toEqual({ playerKey: "BIS-ALE-05", name: "BRISTOT Alessandro", shirtNumber: 2, role: "Schiacciatore" });
    expect(playerKeysOnTeamPage(fixture("team-6707.html"))).toHaveLength(15);
  });
});

describe("player page", () => {
  it("reads name, birth date, height, nationality and role", () => {
    expect(parsePlayerPage(fixture("player-BIS-ALE-05.html"))).toEqual({
      name: "Bristot Alessandro",
      birthDate: "08/04/2005",
      height: 196,
      nationality: "ITA",
      role: "Schiacciatore",
    });
  });
});

describe("positions and Clubs", () => {
  it("maps the Italian roles", () => {
    expect(["Palleggiatore", "Schiacciatore", "Opposto", "Centrale", "Libero"].map(mapPosition)).toEqual([
      "setter",
      "outside_hitter",
      "opposite",
      "middle_blocker",
      "libero",
    ]);
    expect(mapPosition("Allenatore")).toBeNull();
  });

  it("keeps sponsor words out of Club slugs", () => {
    for (const { slug } of Object.values(clubsByCode)) expect(slug).toMatch(/^[a-z-]+$/);
    expect(clubForCode("CUNEOSPORT").slug).toBe("cuneo");
  });

  it("says which code is unknown", () => {
    expect(() => clubForCode("NOPE")).toThrow(/NOPE/);
  });
});

describe("Europe/Rome", () => {
  it("converts winter and summer time", () => {
    expect(localToUtc(parseSlashDateTime("21/12/2025", "20:30"), "Europe/Rome").toISOString()).toBe("2025-12-21T19:30:00.000Z");
    expect(localToUtc(parseSlashDateTime("2/5/2026", "18:00"), "Europe/Rome").toISOString()).toBe("2026-05-02T16:00:00.000Z");
  });

  it("rejects other formats", () => {
    expect(() => parseSlashDateTime("2026-02-25", "20:30")).toThrow();
  });
});
