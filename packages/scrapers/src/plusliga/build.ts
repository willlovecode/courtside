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
import { localDateString, localToUtc, parseDotDateTime } from "../time";
import { mapBoxScore } from "./boxScore";
import { resolveBoxScoreSide } from "./boxScoreSide";
import { clubForSiteId, leagueId, pageKinds, publicUrls, seasonLabelOnSite, siteOrigin, timeZone } from "./config";
import { parseMatchList, type ListedMatch } from "./matchList";
import { parseMatchPage, type MatchPage } from "./matchPage";
import { parsePlayerPage, type PlayerPage } from "./playerPage";
import { mapPosition } from "./positions";
import { seasonPlans, tourOf } from "./seasons";
import { readPage, requirePage, snapshotKey } from "./snapshots";
import { parseFinalStandings } from "./standingsTable";
import { parseTeamIndex, parseTeamPage, type TeamPage } from "./teamPage";

export const seasonId = (label: string) => `${leagueId}-${label}`;
export const playerId = (siteId: string) => `${leagueId}-p${siteId}`;
export const matchId = (siteId: string) => `${leagueId}-m${siteId}`;
export const clubId = (clubSlug: string) => `${leagueId}-${clubSlug}`;
export const teamId = (clubSlug: string, label: string) => `${clubId(clubSlug)}-${label}`;

function isoDate(dotDate: string | undefined): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dotDate ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

interface TeamRecord {
  siteId: string;
  club: ParsedClub;
  team: ParsedTeam;
  page: TeamPage;
}

/** Reads the stored snapshots of `season` (and the Roster Seasons of its plan) into our own model. */
export async function buildPlusLiga(
  store: SnapshotStore,
  season: string,
  log: (message: string) => void = () => {},
): Promise<ParsedLeague> {
  const plan = seasonPlans[season];
  if (!plan) throw new Error(`No plan for PlusLiga ${season}`);
  const mainTour = await tourOf(store, season);
  const sourceRefs: ParsedSourceRef[] = [];
  // Things parse could not use. They travel with the parsed data so the check step can report them.
  const warnings: string[] = [];
  const warn = (message: string) => {
    warnings.push(message);
    log(`warning: ${message}`);
  };
  const clubs = new Map<string, ParsedClub>();

  // Teams and Rosters of every Season in the plan.
  const teamRecords = new Map<string, Map<string, TeamRecord>>();
  for (const label of [season, ...plan.rosterSeasons]) {
    const tour = await tourOf(store, label);
    const records = new Map<string, TeamRecord>();
    const indexHtml = await requirePage(store, snapshotKey(label, pageKinds.teamIndex, "index"));
    for (const siteId of parseTeamIndex(indexHtml)) {
      const page = parseTeamPage(await requirePage(store, snapshotKey(label, pageKinds.team, siteId)));
      const known = clubForSiteId(siteId);
      const club: ParsedClub = { id: clubId(known.slug), slug: known.slug, name: known.name };
      clubs.set(club.id, club);
      const team: ParsedTeam = {
        id: teamId(club.slug, label),
        clubId: club.id,
        name: page.name,
        logoUrl: page.logoUrl ? new URL(page.logoUrl, siteOrigin).href : null,
      };
      records.set(siteId, { siteId, club, team, page });
      sourceRefs.push({ entityType: "team", entityId: team.id, sourceId: siteId, sourceUrl: publicUrls.team(tour, siteId) });
      sourceRefs.push({ entityType: "club", entityId: club.id, sourceId: siteId, sourceUrl: publicUrls.club(siteId) });
    }
    teamRecords.set(label, records);
  }
  const mainTeams = teamRecords.get(season) ?? new Map<string, TeamRecord>();
  const teamBySiteId = (siteId: string) => {
    const record = mainTeams.get(siteId);
    if (!record) throw new Error(`Club ${siteId} plays in ${season} but is missing from the team overview`);
    return record;
  };

  // Matches, from the list and one page each.
  const listed = parseMatchList(await requirePage(store, snapshotKey(season, pageKinds.matchList, "all")));
  const matchPages = new Map<string, MatchPage>();
  for (const m of listed) {
    const html = await readPage(store, snapshotKey(season, pageKinds.match, m.siteId));
    if (html === null) warn(`no usable page for Match ${m.siteId}`);
    else matchPages.set(m.siteId, parseMatchPage(html));
  }

  // Players from every Roster, plus any MVP who is on none.
  const playerNames = new Map<string, string>();
  for (const records of teamRecords.values()) {
    for (const { page } of records.values()) {
      for (const row of page.roster) if (!playerNames.has(row.playerSiteId)) playerNames.set(row.playerSiteId, row.name);
    }
  }
  for (const page of matchPages.values()) {
    if (page.mvp && !playerNames.has(page.mvp.playerSiteId)) playerNames.set(page.mvp.playerSiteId, page.mvp.name);
  }

  const playerPages = new Map<string, PlayerPage>();
  for (const siteId of playerNames.keys()) {
    for (const label of [season, ...plan.rosterSeasons]) {
      const html = await readPage(store, snapshotKey(label, pageKinds.player, siteId));
      if (html !== null) {
        playerPages.set(siteId, parsePlayerPage(html));
        break;
      }
    }
    if (!playerPages.has(siteId)) warn(`no usable page for Player ${siteId} (${playerNames.get(siteId)})`);
  }

  const players: ParsedPlayer[] = [];
  for (const siteId of [...playerNames.keys()].sort((a, b) => Number(a) - Number(b))) {
    const page = playerPages.get(siteId);
    const fullName = page?.name || playerNames.get(siteId) || siteId;
    players.push({
      id: playerId(siteId),
      // The loader makes slugs unique across Leagues and keeps those already stored.
      slug: slugify(fullName),
      fullName,
      birthDate: isoDate(page?.birthDate ?? undefined),
      heightCm: page?.heightCm ?? null,
      nationality: null,
    });
    sourceRefs.push({
      entityType: "player",
      entityId: playerId(siteId),
      sourceId: siteId,
      sourceUrl: publicUrls.player(mainTour, siteId),
    });
  }

  // Phases and Rounds in the order the list shows them.
  const mainSeasonId = seasonId(season);
  const regularId = `${mainSeasonId}-regular`;
  const playoffsId = `${mainSeasonId}-playoffs`;
  const placementId = `${mainSeasonId}-placement`;
  const regular: ParsedPhase = { id: regularId, kind: "regular", name: "Regular season", position: 1, rounds: [] };
  const playoffs: ParsedPhase = { id: playoffsId, kind: "playoffs", name: "Play-off", position: 2, rounds: [] };
  const placement: ParsedPhase = { id: placementId, kind: "placement", name: "Placement matches", position: 3, rounds: [] };
  const roundIdFor = (m: ListedMatch): { phase: ParsedPhase; roundId: string } => {
    // The site files "Mecze o 3. miejsce" and "Mecze o 5. miejsce" under the play-off.
    const phase =
      m.phaseLabel === "Faza Zasadnicza" ? regular : /Mecze o \d+\. miejsce/.test(m.roundHeading) ? placement : playoffs;
    const label = m.phaseLabel === "Faza Zasadnicza" ? m.roundHeading.replace(/^Kolejka:\s*/, "Kolejka ") : m.roundHeading;
    let round = phase.rounds.find((r) => r.label === label);
    if (!round) {
      const position =
        phase === regular ? Number(/\d+/.exec(label)?.[0]) : phase.rounds.length + 1;
      round = { id: `${phase.id}-r${String(position).padStart(2, "0")}`, position, label };
      phase.rounds.push(round);
    }
    return { phase, roundId: round.id };
  };

  const matches: ParsedMatch[] = [];
  for (const m of listed) {
    const page = matchPages.get(m.siteId);
    const home = teamBySiteId(m.homeClubSiteId);
    const away = teamBySiteId(m.awayClubSiteId);
    const { phase, roundId } = roundIdFor(m);
    const local = parseDotDateTime(page?.localDateTime || m.localDateTime);
    const sets = page?.sets ?? [];
    const finished = (page?.setsHome ?? m.setsHome) !== null && sets.length > 0;

    matches.push({
      id: matchId(m.siteId),
      // The loader adds a suffix when another Match already has this slug.
      slug: `${localDateString(local)}-${home.club.slug}-${away.club.slug}`,
      phaseId: phase.id,
      roundId,
      homeTeamId: home.team.id,
      awayTeamId: away.team.id,
      startsAt: localToUtc(local, timeZone).toISOString(),
      venueName: page?.venueName ?? null,
      venueCity: page?.venueCity ?? null,
      attendance: page?.attendance ?? null,
      mvpPlayerId: page?.mvp ? playerId(page.mvp.playerSiteId) : null,
      leagueMatchNumber: page?.matchNumber ?? null,
      status: finished ? "finished" : "scheduled",
      homeSetsWon: finished ? (page?.setsHome ?? m.setsHome) : null,
      awaySetsWon: finished ? (page?.setsAway ?? m.setsAway) : null,
      sets,
    });
    sourceRefs.push({
      entityType: "match",
      entityId: matchId(m.siteId),
      sourceId: m.siteId,
      sourceUrl: publicUrls.match(mainTour, m.siteId),
    });
  }

  const standings: ParsedStanding[] = parseFinalStandings(
    await requirePage(store, snapshotKey(season, pageKinds.standings, "final")),
  ).map((row) => ({
    phaseId: regularId,
    teamId: teamBySiteId(row.clubSiteId).team.id,
    position: row.position,
    played: row.played,
    won: row.won,
    lost: row.lost,
    setsWon: row.setsWon,
    setsLost: row.setsLost,
    pointsWon: row.pointsWon,
    pointsLost: row.pointsLost,
    tablePoints: row.tablePoints,
  }));
  sourceRefs.push({
    entityType: "standings",
    entityId: regularId,
    sourceId: String(mainTour),
    sourceUrl: publicUrls.standings(mainTour),
  });

  // Box scores come from each Player's page for the Season: one row per Match played.
  const listedById = new Map(listed.map((m) => [m.siteId, m]));
  const boxScoreLines: ParsedBoxScoreLine[] = [];
  const wantedSeasonLabel = seasonLabelOnSite(season);
  const seen = new Set<string>();
  for (const [siteId, page] of playerPages) {
    if (page.seasonLabel !== wantedSeasonLabel) continue;
    // The Clubs the Player was registered with in this Season, for rows whose Team name does not match.
    const clubSiteIds = page.history.filter((h) => h.tour === mainTour).map((h) => h.clubSiteId);
    for (const row of page.matchRows) {
      const match = listedById.get(row.matchSiteId);
      if (!match) {
        warn(`${page.name} has a Box score row for Match ${row.matchSiteId}, which is not in the match list`);
        continue;
      }
      const side = resolveBoxScoreSide(row, match, clubSiteIds);
      if (side === null) {
        warn(`${page.name} played Match ${row.matchSiteId} for "${row.teamName}", which cannot be told apart from "${row.opponentName}"`);
        continue;
      }
      const key = `${row.matchSiteId}|${siteId}`;
      if (seen.has(key)) {
        warn(`${page.name} has two Box score rows for Match ${row.matchSiteId}; the second is ignored`);
        continue;
      }
      seen.add(key);
      const { core, leagueStats } = mapBoxScore(row.stats);
      boxScoreLines.push({
        matchId: matchId(row.matchSiteId),
        playerId: playerId(siteId),
        teamId: teamBySiteId(side === "home" ? match.homeClubSiteId : match.awayClubSiteId).team.id,
        ...core,
        leagueStats,
      });
    }
  }

  const seasons: ParsedSeason[] = [];
  for (const label of [season, ...plan.rosterSeasons]) {
    const records = teamRecords.get(label) ?? new Map<string, TeamRecord>();
    const rosterEntries: ParsedRosterEntry[] = [];
    for (const { team, page } of records.values()) {
      for (const row of page.roster) {
        rosterEntries.push({
          teamId: team.id,
          playerId: playerId(row.playerSiteId),
          shirtNumber: row.shirtNumber,
          position: mapPosition(row.position),
        });
      }
    }
    const isMain = label === season;
    seasons.push({
      id: seasonId(label),
      label,
      phases: isMain ? [regular, playoffs, placement].filter((p) => p.rounds.length > 0) : [],
      teams: [...records.values()].map((r) => r.team),
      rosterEntries,
      matches: isMain ? matches : [],
      standings: isMain ? standings : [],
      boxScoreLines: isMain ? boxScoreLines : [],
    });
  }

  return {
    league: {
      id: leagueId,
      name: "PlusLiga",
      country: "PL",
      timeZone,
      organiser: "Polska Liga Siatkówki",
      websiteUrl: siteOrigin,
    },
    clubs: [...clubs.values()],
    players,
    seasons,
    sourceRefs,
    warnings,
  };
}
