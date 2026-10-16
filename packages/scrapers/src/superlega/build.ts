import type { SnapshotStore } from "../snapshots";
import type {
  ParsedBoxScoreLine,
  ParsedClub,
  ParsedLeague,
  ParsedMatch,
  ParsedPhase,
  ParsedPlayer,
  ParsedRosterEntry,
  ParsedSeason,
  ParsedSourceRef,
  ParsedStanding,
  ParsedTeam,
} from "../model";
import { slugify } from "../slug";
import { localDateString, localToUtc, parseSlashDateTime } from "../time";
import { mapBoxScore, mapPosition } from "./boxScore";
import { annoOf, clubForCode, leagueId, pageKinds, siteOrigin, timeZone, urls } from "./config";
import { competitionsOf, matchIdsOnBracket, readResultsLinks } from "./discover";
import { parseMatchPage, type MatchPage } from "./matchPage";
import { parsePlayerPage, type PlayerPage } from "./playerPage";
import { giornataName, type ResultsPage } from "./resultsPage";
import { seasonPlans } from "./seasons";
import { readPage, requirePage, snapshotKey } from "./snapshots";
import { parseStandings } from "./standingsPage";
import { parseTeamPage, type TeamPage } from "./teamPage";

export const seasonId = (label: string) => `${leagueId}-${label}`;
export const clubId = (clubSlug: string) => `${leagueId}-${clubSlug}`;
export const teamId = (clubSlug: string, label: string) => `${clubId(clubSlug)}-${label}`;
export const playerId = (key: string) => `${leagueId}-p${key}`;
export const matchId = (siteId: string) => `${leagueId}-m${siteId}`;

/** "08/04/2005" or "25/2/2026" (day first) to ISO. */
function isoDate(text: string | null | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text ?? "");
  return m ? `${m[3]}-${m[2]?.padStart(2, "0")}-${m[1]?.padStart(2, "0")}` : null;
}

interface TeamRecord {
  siteId: string;
  code: string;
  club: ParsedClub;
  team: ParsedTeam;
  page: TeamPage;
}

interface Round {
  /** "1ª Giornata Andata" */
  label: string;
  html: string;
}

type Log = (message: string) => void;

/** The regular season's rounds in play order: every Giornata of every Fase, as the selectors list them. */
async function regularRounds(store: SnapshotStore, season: string, regular: string, log: Log): Promise<Round[]> {
  const base = readResultsLinks(await requirePage(store, snapshotKey(season, pageKinds.results, regular)));
  const rounds: Round[] = [];
  for (const fase of base.fasi) {
    const faseId = `${regular}-${fase.value}`;
    const fasePage = await readPage(store, snapshotKey(season, pageKinds.results, faseId));
    if (fasePage === null) {
      log(`warning: no usable page for Fase ${fase.label}`);
      continue;
    }
    for (const giornata of readResultsLinks(fasePage).giornate) {
      const html = await readPage(store, snapshotKey(season, pageKinds.results, `${faseId}-${giornata.value}`));
      if (html === null) log(`warning: no usable page for ${giornata.label} ${fase.label}`);
      else rounds.push({ label: `${giornataName(giornata.label)} ${fase.label}`, html });
    }
  }
  return rounds;
}

/** Reads the stored snapshots of `season` (and the Roster Seasons of its plan) into our own model. */
export async function buildSuperLega(store: SnapshotStore, season: string, log: Log = () => {}): Promise<ParsedLeague> {
  const plan = seasonPlans[season];
  if (!plan) throw new Error(`No plan for SuperLega ${season}`);
  const labels = [season, ...plan.rosterSeasons];
  const sourceRefs: ParsedSourceRef[] = [];
  // Things parse could not use. They travel with the parsed data so the check step can report them.
  const warnings: string[] = [];
  const warn = (message: string) => {
    warnings.push(message);
    log(`warning: ${message}`);
  };

  // Results pages: competitions, rounds and the Teams that appear.
  const competitions = new Map<string, ReturnType<typeof competitionsOf>>();
  const teamSiteIds = new Map<string, Set<string>>();
  let rounds: Round[] = [];
  for (const label of labels) {
    const root = readResultsLinks(await requirePage(store, snapshotKey(label, pageKinds.resultsRoot, "root")));
    const found = competitionsOf(root);
    if (!found.regular) throw new Error(`No regular season SuperLega competition for ${label}`);
    competitions.set(label, found);

    const ids = new Set<string>();
    const pages: ResultsPage[] = [];
    if (label === season) {
      rounds = await regularRounds(store, label, found.regular, warn);
      pages.push(...rounds.map((r) => readResultsLinks(r.html)));
    } else {
      pages.push(readResultsLinks(await requirePage(store, snapshotKey(label, pageKinds.results, found.regular))));
    }
    for (const result of pages.flatMap((p) => p.results)) ids.add(result.homeTeamSiteId).add(result.awayTeamSiteId);
    teamSiteIds.set(label, ids);
  }

  // Teams and Rosters. The Club comes from the site's own Squadra code.
  const clubs = new Map<string, ParsedClub>();
  const teamRecords = new Map<string, TeamRecord[]>();
  for (const label of labels) {
    const records: TeamRecord[] = [];
    for (const siteId of teamSiteIds.get(label) ?? []) {
      const page = parseTeamPage(await requirePage(store, snapshotKey(label, pageKinds.team, siteId)));
      if (!page.code) throw new Error(`Team page ${siteId} has no Squadra code`);
      const known = clubForCode(page.code);
      const club: ParsedClub = { id: clubId(known.slug), slug: known.slug, name: known.name };
      clubs.set(club.id, club);
      records.push({
        siteId,
        code: page.code,
        club,
        team: { id: teamId(club.slug, label), clubId: club.id, name: page.name, logoUrl: page.logoUrl },
        page,
      });
      sourceRefs.push({ entityType: "team", entityId: teamId(club.slug, label), sourceId: siteId, sourceUrl: urls.team(siteId) });
      sourceRefs.push({ entityType: "club", entityId: club.id, sourceId: page.code, sourceUrl: urls.team(siteId) });
    }
    teamRecords.set(label, records);
  }
  const mainTeams = new Map((teamRecords.get(season) ?? []).map((r) => [r.code, r]));
  const teamByCode = (code: string) => {
    const record = mainTeams.get(code);
    if (!record) throw new Error(`Club ${code} plays in ${season} but has no team page`);
    return record;
  };

  // Every Match of the Season: round by round for the regular season, from the brackets for the play-offs.
  const mainCompetitions = competitions.get(season);
  const wanted: { siteId: string; phase: "regular" | "playoffs" | "placement"; round: string | null }[] = [];
  for (const round of rounds) {
    for (const result of readResultsLinks(round.html).results) {
      if (result.matchSiteId) wanted.push({ siteId: result.matchSiteId, phase: "regular", round: round.label });
    }
  }
  for (const phase of ["playoffs", "placement"] as const) {
    const competition = mainCompetitions?.[phase];
    if (!competition) continue;
    const html = await readPage(store, snapshotKey(season, pageKinds.bracket, competition));
    if (html === null) {
      warn(`no usable bracket page for the ${phase}`);
      continue;
    }
    for (const siteId of matchIdsOnBracket(html)) wanted.push({ siteId, phase, round: null });
  }

  const matchPages = new Map<string, MatchPage>();
  for (const { siteId } of wanted) {
    const html = await readPage(store, snapshotKey(season, pageKinds.match, siteId));
    if (html === null) warn(`no usable page for Match ${siteId}`);
    else matchPages.set(siteId, parseMatchPage(html));
  }

  // Players: every Roster, every Box score and every MVP.
  const playerNames = new Map<string, string>();
  for (const records of teamRecords.values()) {
    for (const { page } of records) for (const row of page.roster) if (!playerNames.has(row.playerKey)) playerNames.set(row.playerKey, row.name);
  }
  for (const page of matchPages.values()) {
    for (const box of page.boxScores) for (const row of box.rows) playerNames.set(row.playerKey, row.name);
    if (page.mvp && !playerNames.has(page.mvp.playerKey)) playerNames.set(page.mvp.playerKey, page.mvp.name);
  }

  const playerPages = new Map<string, PlayerPage>();
  for (const key of playerNames.keys()) {
    for (const label of labels) {
      const html = await readPage(store, snapshotKey(label, pageKinds.player, key));
      if (html !== null) {
        playerPages.set(key, parsePlayerPage(html));
        break;
      }
    }
    if (!playerPages.has(key)) warn(`no usable page for Player ${key} (${playerNames.get(key)})`);
  }

  const players: ParsedPlayer[] = [];
  for (const key of [...playerNames.keys()].sort()) {
    const page = playerPages.get(key);
    const fullName = page?.name || playerNames.get(key) || key;
    players.push({
      id: playerId(key),
      // The loader makes slugs unique across Leagues and keeps those already stored.
      slug: slugify(fullName),
      fullName,
      birthDate: isoDate(page?.birthDate),
      heightCm: page?.height ?? null,
      nationality: page?.nationality ?? null,
    });
    sourceRefs.push({ entityType: "player", entityId: playerId(key), sourceId: key, sourceUrl: urls.player(key) });
  }

  // Phases and Rounds.
  const mainSeasonId = seasonId(season);
  const phases: Record<"regular" | "playoffs" | "placement", ParsedPhase> = {
    regular: { id: `${mainSeasonId}-regular`, kind: "regular", name: "Regular season", position: 1, rounds: [] },
    playoffs: { id: `${mainSeasonId}-playoffs`, kind: "playoffs", name: "Play-off", position: 2, rounds: [] },
    placement: { id: `${mainSeasonId}-placement`, kind: "placement", name: "Play-off for 5th place", position: 3, rounds: [] },
  };
  const regularPhase: ParsedPhase = phases.regular;
  rounds.forEach((round, i) => {
    regularPhase.rounds.push({ id: `${regularPhase.id}-r${String(i + 1).padStart(2, "0")}`, position: i + 1, label: round.label });
  });

  // Matches.
  const matches: ParsedMatch[] = [];
  const boxScoreLines: ParsedBoxScoreLine[] = [];
  const seenBoxScore = new Set<string>();
  const stageStart = new Map<string, number>();
  const pendingPlayoff: { match: ParsedMatch; phase: "playoffs" | "placement"; stage: string }[] = [];

  for (const { siteId, phase, round } of wanted) {
    const page = matchPages.get(siteId);
    if (!page) continue;
    if (!page.date || !page.time) {
      warn(`Match ${siteId} has no date or time`);
      continue;
    }
    let local;
    try {
      local = parseSlashDateTime(page.date, page.time);
    } catch {
      warn(`Match ${siteId} has an unreadable date or time`);
      continue;
    }
    const startsAt = localToUtc(local, timeZone);

    const home = teamByCode(page.home.code);
    const away = teamByCode(page.away.code);
    const finished = page.sets.length > 0 && page.home.setsWon !== null && page.away.setsWon !== null;
    const stage = (page.stage ?? "").replace(/^Gara \d+\s+/, "");

    const match: ParsedMatch = {
      id: matchId(siteId),
      slug: `${localDateString(local)}-${home.club.slug}-${away.club.slug}`,
      phaseId: phases[phase].id,
      roundId: "",
      homeTeamId: home.team.id,
      awayTeamId: away.team.id,
      startsAt: startsAt.toISOString(),
      venueName: page.venueName,
      venueCity: page.venueCity,
      attendance: page.attendance,
      mvpPlayerId: page.mvp ? playerId(page.mvp.playerKey) : null,
      leagueMatchNumber: page.matchNumber,
      status: finished ? "finished" : "scheduled",
      homeSetsWon: finished ? page.home.setsWon : null,
      awaySetsWon: finished ? page.away.setsWon : null,
      sets: page.sets,
    };
    if (phase === "regular") {
      const found = regularPhase.rounds.find((r) => r.label === round);
      if (!found) throw new Error(`No round for ${round}`);
      match.roundId = found.id;
    } else {
      if (!stage) warn(`Match ${siteId} has no stage in its header`);
      const key = `${phase}|${stage}`;
      stageStart.set(key, Math.min(stageStart.get(key) ?? Infinity, startsAt.getTime()));
      pendingPlayoff.push({ match, phase, stage });
    }
    matches.push(match);
    sourceRefs.push({ entityType: "match", entityId: match.id, sourceId: siteId, sourceUrl: urls.match(siteId) });

    // Box scores: the first table is the home team's, the second the away team's.
    page.boxScores.forEach((box, i) => {
      const side = i === 0 ? { record: home, name: page.home.name } : { record: away, name: page.away.name };
      if (box.teamName.trim().toLowerCase() !== side.name.trim().toLowerCase()) {
        warn(`Match ${siteId}: Box score ${i + 1} is for "${box.teamName}", expected "${side.name}"`);
      }
      const shown = box.rows.reduce((total, row) => total + (row.stats["Punti Tot"] ?? 0), 0);
      if (box.totalPoints !== null && shown !== box.totalPoints) {
        warn(`Match ${siteId}: ${box.teamName} players add up to ${shown} points, the team total says ${box.totalPoints}`);
      }
      for (const row of box.rows) {
        const mapped = mapBoxScore(row);
        if (!mapped) continue;
        const key = `${siteId}|${row.playerKey}`;
        if (seenBoxScore.has(key)) {
          warn(`Match ${siteId}: ${row.name} appears twice in the Box scores; the second is ignored`);
          continue;
        }
        seenBoxScore.add(key);
        boxScoreLines.push({
          matchId: match.id,
          playerId: playerId(row.playerKey),
          teamId: side.record.team.id,
          ...mapped.core,
          leagueStats: mapped.leagueStats,
        });
      }
    });
  }

  // Play-off rounds are named by the stage in the match header and ordered by when they were first played.
  for (const phase of ["playoffs", "placement"] as const) {
    const stages = [...new Set(pendingPlayoff.filter((p) => p.phase === phase).map((p) => p.stage))].sort(
      (a, b) => (stageStart.get(`${phase}|${a}`) ?? 0) - (stageStart.get(`${phase}|${b}`) ?? 0),
    );
    stages.forEach((stage, i) => {
      phases[phase].rounds.push({ id: `${phases[phase].id}-r${String(i + 1).padStart(2, "0")}`, position: i + 1, label: stage || "Play-off" });
    });
    for (const p of pendingPlayoff.filter((x) => x.phase === phase)) {
      p.match.roundId = phases[phase].rounds[stages.indexOf(p.stage)]?.id ?? "";
    }
  }

  // Standings: the final table of the regular season, Teams found by their Squadra code.
  const standings: ParsedStanding[] = [];
  const standingsHtml = await readPage(store, snapshotKey(season, pageKinds.standings, "final"));
  if (standingsHtml === null) warn("no usable standings page");
  else {
    for (const row of parseStandings(standingsHtml)) {
      if (!row.code || row.code === "0") throw new Error(`Standing row "${row.name}" has no Squadra code; the site answered without Club codes`);
      standings.push({
        phaseId: phases.regular.id,
        teamId: teamByCode(row.code).team.id,
        position: row.position,
        played: row.played,
        won: row.won,
        lost: row.lost,
        setsWon: row.setsWon,
        setsLost: row.setsLost,
        pointsWon: row.pointsWon,
        pointsLost: row.pointsLost,
        tablePoints: row.tablePoints,
      });
    }
    const anno = annoOf(season);
    const competition = mainCompetitions?.regular ?? "";
    sourceRefs.push({
      entityType: "standings",
      entityId: phases.regular.id,
      sourceId: competition,
      sourceUrl: urls.standings(anno, competition),
    });
  }

  const seasons: ParsedSeason[] = labels.map((label) => {
    const isMain = label === season;
    const rosterEntries: ParsedRosterEntry[] = [];
    for (const { team, page } of teamRecords.get(label) ?? []) {
      for (const row of page.roster) {
        const position = mapPosition(row.role);
        if (position === null) warn(`Player ${row.playerKey} has the unknown role "${row.role}"`);
        rosterEntries.push({ teamId: team.id, playerId: playerId(row.playerKey), shirtNumber: row.shirtNumber, position });
      }
    }
    return {
      id: seasonId(label),
      label,
      phases: isMain ? [phases.regular, phases.playoffs, phases.placement].filter((p) => p.rounds.length > 0) : [],
      teams: (teamRecords.get(label) ?? []).map((r) => r.team),
      rosterEntries,
      matches: isMain ? matches : [],
      standings: isMain ? standings : [],
      boxScoreLines: isMain ? boxScoreLines : [],
    };
  });

  return {
    league: {
      id: leagueId,
      name: "SuperLega",
      country: "IT",
      timeZone,
      organiser: "Lega Pallavolo Serie A",
      websiteUrl: siteOrigin,
    },
    clubs: [...clubs.values()],
    players,
    seasons,
    sourceRefs,
    warnings,
  };
}
