import type { LeagueStats, MatchStatus, PhaseKind, PlayerPosition, SourceEntityType } from "@courtside/db";

/**
 * What parse produces and load stores. Ids are our own and deterministic,
 * so loading the same snapshots twice updates rows instead of adding new ones.
 */
export interface ParsedLeague {
  league: {
    id: string;
    name: string;
    country: string;
    timeZone: string;
    organiser: string | null;
    websiteUrl: string | null;
  };
  clubs: ParsedClub[];
  players: ParsedPlayer[];
  seasons: ParsedSeason[];
  sourceRefs: ParsedSourceRef[];
}

export interface ParsedClub {
  id: string;
  slug: string;
  name: string;
}

export interface ParsedPlayer {
  id: string;
  slug: string;
  fullName: string;
  birthDate: string | null;
  heightCm: number | null;
  nationality: string | null;
}

export interface ParsedSeason {
  id: string;
  label: string;
  phases: ParsedPhase[];
  teams: ParsedTeam[];
  rosterEntries: ParsedRosterEntry[];
  matches: ParsedMatch[];
  standings: ParsedStanding[];
  boxScoreLines: ParsedBoxScoreLine[];
}

export interface ParsedPhase {
  id: string;
  kind: PhaseKind;
  name: string;
  position: number;
  rounds: ParsedRound[];
}

export interface ParsedRound {
  id: string;
  position: number;
  label: string;
}

export interface ParsedTeam {
  id: string;
  clubId: string;
  name: string;
  logoUrl: string | null;
}

export interface ParsedRosterEntry {
  teamId: string;
  playerId: string;
  shirtNumber: number | null;
  position: PlayerPosition | null;
}

export interface ParsedSetScore {
  setNumber: number;
  homePoints: number;
  awayPoints: number;
  durationMinutes: number | null;
}

export interface ParsedMatch {
  id: string;
  slug: string;
  phaseId: string;
  roundId: string;
  homeTeamId: string;
  awayTeamId: string;
  /** ISO 8601 in UTC. */
  startsAt: string;
  venueName: string | null;
  venueCity: string | null;
  attendance: number | null;
  mvpPlayerId: string | null;
  leagueMatchNumber: string | null;
  status: MatchStatus;
  homeSetsWon: number | null;
  awaySetsWon: number | null;
  sets: ParsedSetScore[];
}

export interface ParsedStanding {
  phaseId: string;
  teamId: string;
  position: number;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
  tablePoints: number;
}

export interface ParsedBoxScoreLine {
  matchId: string;
  playerId: string;
  teamId: string;
  setsPlayed: number;
  points: number;
  attackPoints: number;
  aces: number;
  blocks: number;
  errors: number;
  leagueStats: LeagueStats;
}

export interface ParsedSourceRef {
  entityType: SourceEntityType;
  entityId: string;
  sourceId: string;
  sourceUrl: string;
}
