import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapBoxScore } from "../src/plusliga/boxScore";
import { matchIdsOnList, playerIdsOnMatchPage, playerIdsOnTeamPage } from "../src/plusliga/discover";
import { parseMatchList } from "../src/plusliga/matchList";
import { parseMatchPage } from "../src/plusliga/matchPage";
import { parsePlayerPage } from "../src/plusliga/playerPage";
import { parseFinalStandings } from "../src/plusliga/standingsTable";
import { parseSeasonLinks, parseTeamIndex, parseTeamPage } from "../src/plusliga/teamPage";
import { localToUtc, parseDotDateTime } from "../src/time";

const fixture = (name: string) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "plusliga", name), "utf8");

describe("match list", () => {
  const matches = parseMatchList(fixture("matchlist.html"));

  it("lists each Match once, however often the page repeats it", () => {
    expect(matches).toHaveLength(208);
    expect(new Set(matches.map((m) => m.siteId)).size).toBe(208);
    expect(matchIdsOnList(fixture("matchlist.html"))).toHaveLength(208);
  });

  it("splits into 182 regular-season and 26 playoff Matches", () => {
    expect(matches.filter((m) => m.phaseLabel === "Faza Zasadnicza")).toHaveLength(182);
    expect(matches.filter((m) => m.phaseLabel === "Faza Play-Off")).toHaveLength(26);
  });

  it("groups the regular season into 26 Rounds of 7 Matches", () => {
    const rounds = new Map<string, number>();
    for (const m of matches.filter((x) => x.phaseLabel === "Faza Zasadnicza")) {
      rounds.set(m.roundHeading, (rounds.get(m.roundHeading) ?? 0) + 1);
    }
    expect(rounds.size).toBe(26);
    expect([...rounds.values()].every((n) => n === 7)).toBe(true);
    expect(rounds.has("Kolejka: 1")).toBe(true);
    expect(rounds.has("Kolejka: 26")).toBe(true);
  });

  it("keeps the Polish playoff Round names", () => {
    const names = new Set(matches.filter((m) => m.phaseLabel === "Faza Play-Off").map((m) => m.roundHeading));
    expect([...names]).toEqual([
      "Runda I: Ćwierćfinał (do 2 zwycięstw)",
      "Runda II: Półfinał (do 2 zwycięstw)",
      "Runda III: Mecze o 5. miejsce (do 2 zwycięstw)",
      "Runda III: Mecze o 3. miejsce (do 3 zwycięstw)",
      "Runda III: Finał (do 3 zwycięstw)",
    ]);
  });

  it("knows 14 Clubs by the site's team ids", () => {
    const ids = new Set(matches.flatMap((m) => [m.homeClubSiteId, m.awayClubSiteId]));
    expect([...ids].sort((a, b) => Number(a) - Number(b))).toEqual(
      ["2", "3", "8", "21", "24", "26", "28", "45", "56", "61", "62", "71", "78", "93"].sort((a, b) => Number(a) - Number(b)),
    );
  });

  it("reads a known Match: JSW Jastrzębski Węgiel 1-3 BOGDANKA LUK Lublin", () => {
    const m = matches.find((x) => x.siteId === "1104534");
    expect(m).toMatchObject({
      homeClubSiteId: "26",
      awayClubSiteId: "45",
      homeName: "JSW Jastrzębski Węgiel",
      awayName: "BOGDANKA LUK Lublin",
      localDateTime: "19.11.2025, 17:30",
      phaseLabel: "Faza Zasadnicza",
      setsHome: 1,
      setsAway: 3,
    });
    expect(localToUtc(parseDotDateTime(m?.localDateTime ?? ""), "Europe/Warsaw").toISOString()).toBe("2025-11-19T16:30:00.000Z");
  });

  it("takes the team on the left as home", () => {
    const m = matches.find((x) => x.siteId === "1104571");
    expect(m).toMatchObject({ homeClubSiteId: "71", homeName: "Steam Hemarpol Politechnika Częstochowa", awayClubSiteId: "45" });
  });
});

describe("standings table", () => {
  const rows = parseFinalStandings(fixture("standings.html"));

  it("takes the table after the last Round", () => {
    expect(rows).toHaveLength(14);
    expect(rows.map((r) => r.position)).toEqual([...Array(14).keys()].map((i) => i + 1));
    expect(rows.every((r) => r.played === 26)).toBe(true);
  });

  it("reads one row in full", () => {
    expect(rows[0]).toEqual({
      position: 1,
      clubSiteId: "2",
      name: "Aluron CMC Warta Zawiercie",
      tablePoints: 61,
      played: 26,
      won: 21,
      lost: 5,
      setsWon: 68,
      setsLost: 27,
      pointsWon: 2234,
      pointsLost: 1993,
    });
  });
});

describe("match page", () => {
  const page = parseMatchPage(fixture("match-1104534.html"));

  it("reads the set table", () => {
    expect(page.sets).toEqual([
      { setNumber: 1, durationMinutes: 24, homePoints: 15, awayPoints: 25 },
      { setNumber: 2, durationMinutes: 33, homePoints: 28, awayPoints: 26 },
      { setNumber: 3, durationMinutes: 33, homePoints: 26, awayPoints: 28 },
      { setNumber: 4, durationMinutes: 22, homePoints: 17, awayPoints: 25 },
    ]);
  });

  it("reads result, time and teams", () => {
    expect(page).toMatchObject({
      siteId: "1104534",
      homeClubSiteId: "26",
      awayClubSiteId: "45",
      localDateTime: "19.11.2025, 17:30",
      setsHome: 1,
      setsAway: 3,
    });
  });

  it("reads the facts: Round, MVP, attendance and venue", () => {
    expect(page).toMatchObject({
      phase: "Zasadnicza",
      round: "5",
      matchNumber: "031",
      mvp: { playerSiteId: "1453", name: "Marcin Komenda" },
      attendance: 2719,
      venueName: "HWS w Jastrzębiu-Zdroju",
      venueCity: "Jastrzębie Zdrój",
    });
    expect(playerIdsOnMatchPage(fixture("match-1104534.html"))).toEqual(["1453"]);
  });
});

describe("team page", () => {
  const page = parseTeamPage(fixture("team-2.html"));

  it("reads the Season's Team name, logo and Roster", () => {
    expect(page.name).toBe("Aluron CMC Warta Zawiercie");
    expect(page.logoUrl).toBe("/dl/676048/inline/scalex=300/f6eba5/aluron_cmc_logo_2020.png");
    expect(page.roster).toHaveLength(15);
    expect(page.roster[0]).toEqual({ playerSiteId: "314", name: "Bartosz Kwolek", shirtNumber: 2, position: "Przyjmujący" });
    expect(playerIdsOnTeamPage(fixture("team-2.html"))).toHaveLength(15);
  });

  it("finds the other Seasons in the selector", () => {
    const links = parseSeasonLinks(fixture("team-2.html"));
    expect(links).toContainEqual({ label: "Sezon 2026/2027", tour: 53 });
    expect(links).toContainEqual({ label: "Sezon 2025/2026", tour: 52 });
  });

  it("lists the 14 Teams of the Season overview", () => {
    expect(parseTeamIndex(fixture("teams-index.html"))).toHaveLength(14);
  });
});

describe("player page", () => {
  const page = parsePlayerPage(fixture("player-1453.html"));

  it("reads who the Player is and which Season the page shows", () => {
    expect(page).toMatchObject({
      name: "Marcin Komenda",
      seasonLabel: "Sezon 2025/2026",
      birthDate: "24.05.1996",
      position: "Rozgrywający",
      heightCm: 198,
    });
    expect(page.history[1]).toEqual({
      from: "26.09.2025",
      to: "31.05.2026",
      position: "Rozgrywający",
      shirtNumber: 4,
      clubSiteId: "45",
      tour: 52,
    });
  });

  it("has one Box score row per Match played, without the totals rows", () => {
    expect(page.matchRows).toHaveLength(34);
    expect(new Set(page.matchRows.map((r) => r.matchSiteId)).size).toBe(34);
  });

  it("puts the Player's own Team first", () => {
    expect(page.matchRows[0]).toMatchObject({
      matchSiteId: "1104571",
      teamName: "BOGDANKA LUK Lublin",
      opponentName: "Steam Hemarpol Politechnika Częstochowa",
    });
  });

  it("keeps every column under its Polish label", () => {
    expect(Object.keys(page.matchRows[0]?.stats ?? {})).toEqual([
      "Sety",
      "Punkty Suma",
      "Punkty BP",
      "Punkty Bilans",
      "Zagrywka Suma",
      "Zagrywka Błąd",
      "Zagrywka As",
      "Zagrywka Eff%",
      "Przyjęcie Suma",
      "Przyjęcie Błąd",
      "Przyjęcie Poz%",
      "Przyjęcie Perf%",
      "Atak Suma",
      "Atak Błąd",
      "Atak Blok",
      "Atak Pkt",
      "Atak Skut%",
      "Atak Eff%",
      "Blok Pkt",
      "Blok Wyblok",
      "Obrona",
      "Asysta",
    ]);
  });
});

describe("Box score core mapping", () => {
  const page = parsePlayerPage(fixture("player-1453.html"));
  const row = (matchSiteId: string) => {
    const found = page.matchRows.find((r) => r.matchSiteId === matchSiteId);
    if (!found) throw new Error(`no row for ${matchSiteId}`);
    return found;
  };

  it("maps Komenda against Częstochowa: 3 sets, 5 points from blocks", () => {
    const { core, leagueStats } = mapBoxScore(row("1104571").stats);
    expect(core).toEqual({ setsPlayed: 3, points: 5, attackPoints: 0, aces: 0, blocks: 5, errors: 0 });
    expect(leagueStats).toMatchObject({ "Punkty BP": 4, "Zagrywka Suma": 12, "Zagrywka Eff%": 0, "Przyjęcie Poz%": null, Obrona: 8, Asysta: 30 });
  });

  it("counts a service error as an error and leaves the sums in the core only", () => {
    const { core, leagueStats } = mapBoxScore(row("1104582").stats);
    expect(core).toEqual({ setsPlayed: 3, points: 2, attackPoints: 0, aces: 0, blocks: 2, errors: 1 });
    expect(leagueStats).not.toHaveProperty("Sety");
    expect(leagueStats).not.toHaveProperty("Punkty Suma");
    expect(leagueStats).toHaveProperty("Zagrywka Błąd", 1);
  });
});

describe("Box score errors", () => {
  it("adds the four error columns of a real row", () => {
    const page = parsePlayerPage(fixture("player-1453.html"));
    const found = page.matchRows.find((r) => r.matchSiteId === "1104537");
    const { core, leagueStats } = mapBoxScore(found?.stats ?? {});
    const parts = ["Zagrywka Błąd", "Przyjęcie Błąd", "Atak Błąd", "Atak Blok"].map((label) => Number(leagueStats[label]));
    expect(core.errors).toBe(3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe("mapBoxScore", () => {
  const stats = {
    Sety: 4,
    "Punkty Suma": 20,
    "Punkty BP": 3,
    "Zagrywka Błąd": 2,
    "Zagrywka As": 3,
    "Przyjęcie Błąd": 4,
    "Atak Błąd": 5,
    "Atak Blok": 7,
    "Atak Pkt": 11,
    "Blok Pkt": 6,
    "Atak Skut%": null,
  };

  it("adds service, reception and attack errors and attacks blocked", () => {
    expect(mapBoxScore(stats).core).toEqual({ setsPlayed: 4, points: 20, attackPoints: 11, aces: 3, blocks: 6, errors: 2 + 4 + 5 + 7 });
  });

  it("treats a dash as zero in the core but keeps it as null", () => {
    const result = mapBoxScore({ ...stats, "Zagrywka Błąd": null });
    expect(result.core.errors).toBe(4 + 5 + 7);
    expect(result.leagueStats["Zagrywka Błąd"]).toBeNull();
    expect(result.leagueStats["Atak Skut%"]).toBeNull();
  });

  it("refuses a page whose columns changed", () => {
    expect(() => mapBoxScore({ Sety: 3 })).toThrow(/Punkty Suma/);
  });
});
