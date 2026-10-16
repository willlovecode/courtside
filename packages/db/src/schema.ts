import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const matchStatuses = ["scheduled", "finished"] as const;
export type MatchStatus = (typeof matchStatuses)[number];

export const phaseKinds = ["regular", "playoffs", "placement"] as const;
export type PhaseKind = (typeof phaseKinds)[number];

export const playerPositions = [
  "setter",
  "outside_hitter",
  "opposite",
  "middle_blocker",
  "libero",
] as const;
export type PlayerPosition = (typeof playerPositions)[number];

export const sourceEntityTypes = [
  "league",
  "season",
  "club",
  "team",
  "player",
  "match",
  "standings",
] as const;
export type SourceEntityType = (typeof sourceEntityTypes)[number];

/** Original Box score columns of a League that have no place in the shared core. */
export type LeagueStats = Record<string, number | string | null>;

export const leagues = pgTable("leagues", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  timeZone: text("time_zone").notNull(),
  organiser: text("organiser"),
  websiteUrl: text("website_url"),
});

export const seasons = pgTable(
  "seasons",
  {
    id: text("id").primaryKey(),
    leagueId: text("league_id")
      .notNull()
      .references(() => leagues.id),
    label: text("label").notNull(),
  },
  (t) => [unique("seasons_league_label").on(t.leagueId, t.label)],
);

export const phases = pgTable(
  "phases",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id),
    kind: text("kind", { enum: phaseKinds }).notNull(),
    name: text("name").notNull(),
    position: smallint("position").notNull(),
  },
  (t) => [unique("phases_season_position").on(t.seasonId, t.position)],
);

export const rounds = pgTable(
  "rounds",
  {
    id: text("id").primaryKey(),
    phaseId: text("phase_id")
      .notNull()
      .references(() => phases.id),
    position: smallint("position").notNull(),
    label: text("label").notNull(),
  },
  (t) => [unique("rounds_phase_position").on(t.phaseId, t.position)],
);

export const clubs = pgTable("clubs", {
  id: text("id").primaryKey(),
  leagueId: text("league_id")
    .notNull()
    .references(() => leagues.id),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey(),
    clubId: text("club_id")
      .notNull()
      .references(() => clubs.id),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id),
    /** The name the League used that Season, sponsor included. */
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
  },
  (t) => [unique("teams_club_season").on(t.clubId, t.seasonId)],
);

export const players = pgTable("players", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  fullName: text("full_name").notNull(),
  birthDate: date("birth_date", { mode: "string" }),
  heightCm: smallint("height_cm"),
  nationality: text("nationality"),
});

export const rosterEntries = pgTable(
  "roster_entries",
  {
    id: serial("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    shirtNumber: smallint("shirt_number"),
    position: text("position", { enum: playerPositions }),
  },
  (t) => [unique("roster_entries_team_player").on(t.teamId, t.playerId)],
);

export const matches = pgTable(
  "matches",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id),
    phaseId: text("phase_id")
      .notNull()
      .references(() => phases.id),
    roundId: text("round_id")
      .notNull()
      .references(() => rounds.id),
    homeTeamId: text("home_team_id")
      .notNull()
      .references(() => teams.id),
    awayTeamId: text("away_team_id")
      .notNull()
      .references(() => teams.id),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    venueName: text("venue_name"),
    venueCity: text("venue_city"),
    attendance: integer("attendance"),
    mvpPlayerId: text("mvp_player_id").references(() => players.id),
    leagueMatchNumber: text("league_match_number"),
    status: text("status", { enum: matchStatuses }).notNull(),
    homeSetsWon: smallint("home_sets_won"),
    awaySetsWon: smallint("away_sets_won"),
  },
  (t) => [
    index("matches_season_idx").on(t.seasonId),
    index("matches_phase_idx").on(t.phaseId),
  ],
);

export const setScores = pgTable(
  "set_scores",
  {
    id: serial("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id),
    setNumber: smallint("set_number").notNull(),
    homePoints: smallint("home_points").notNull(),
    awayPoints: smallint("away_points").notNull(),
    durationMinutes: smallint("duration_minutes"),
  },
  (t) => [unique("set_scores_match_set").on(t.matchId, t.setNumber)],
);

export const boxScoreLines = pgTable(
  "box_score_lines",
  {
    id: serial("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    setsPlayed: smallint("sets_played").notNull(),
    points: smallint("points").notNull(),
    attackPoints: smallint("attack_points").notNull(),
    aces: smallint("aces").notNull(),
    blocks: smallint("blocks").notNull(),
    errors: smallint("errors").notNull(),
    leagueStats: jsonb("league_stats")
      .$type<LeagueStats>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    unique("box_score_lines_match_player").on(t.matchId, t.playerId),
    index("box_score_lines_player_idx").on(t.playerId),
  ],
);

export const standings = pgTable(
  "standings",
  {
    id: serial("id").primaryKey(),
    phaseId: text("phase_id")
      .notNull()
      .references(() => phases.id),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    position: smallint("position").notNull(),
    played: smallint("played").notNull(),
    won: smallint("won").notNull(),
    lost: smallint("lost").notNull(),
    setsWon: smallint("sets_won").notNull(),
    setsLost: smallint("sets_lost").notNull(),
    pointsWon: integer("points_won").notNull(),
    pointsLost: integer("points_lost").notNull(),
    tablePoints: smallint("table_points").notNull(),
  },
  (t) => [unique("standings_phase_team").on(t.phaseId, t.teamId)],
);

/** Links a row back to its official page. */
export const sourceRefs = pgTable(
  "source_refs",
  {
    entityType: text("entity_type", { enum: sourceEntityTypes }).notNull(),
    entityId: text("entity_id").notNull(),
    leagueId: text("league_id")
      .notNull()
      .references(() => leagues.id),
    sourceId: text("source_id").notNull(),
    sourceUrl: text("source_url").notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityType, t.entityId, t.sourceUrl] })],
);
