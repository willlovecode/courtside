CREATE TABLE "box_score_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"player_id" text NOT NULL,
	"team_id" text NOT NULL,
	"sets_played" smallint NOT NULL,
	"points" smallint NOT NULL,
	"attack_points" smallint NOT NULL,
	"aces" smallint NOT NULL,
	"blocks" smallint NOT NULL,
	"errors" smallint NOT NULL,
	"league_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "box_score_lines_match_player" UNIQUE("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "clubs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"time_zone" text NOT NULL,
	"organiser" text,
	"website_url" text
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"season_id" text NOT NULL,
	"phase_id" text NOT NULL,
	"round_id" text NOT NULL,
	"home_team_id" text NOT NULL,
	"away_team_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"venue_name" text,
	"venue_city" text,
	"attendance" integer,
	"mvp_player_id" text,
	"league_match_number" text,
	"status" text NOT NULL,
	"home_sets_won" smallint,
	"away_sets_won" smallint,
	CONSTRAINT "matches_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "phases_season_position" UNIQUE("season_id","position")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"full_name" text NOT NULL,
	"birth_date" date,
	"height_cm" smallint,
	"nationality" text,
	CONSTRAINT "players_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "roster_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"player_id" text NOT NULL,
	"shirt_number" smallint,
	"position" text,
	CONSTRAINT "roster_entries_team_player" UNIQUE("team_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"phase_id" text NOT NULL,
	"position" smallint NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "rounds_phase_position" UNIQUE("phase_id","position")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "seasons_league_label" UNIQUE("league_id","label")
);
--> statement-breakpoint
CREATE TABLE "set_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"set_number" smallint NOT NULL,
	"home_points" smallint NOT NULL,
	"away_points" smallint NOT NULL,
	"duration_minutes" smallint,
	CONSTRAINT "set_scores_match_set" UNIQUE("match_id","set_number")
);
--> statement-breakpoint
CREATE TABLE "source_refs" (
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"league_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_url" text NOT NULL,
	CONSTRAINT "source_refs_entity_type_entity_id_source_url_pk" PRIMARY KEY("entity_type","entity_id","source_url")
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" text NOT NULL,
	"team_id" text NOT NULL,
	"position" smallint NOT NULL,
	"played" smallint NOT NULL,
	"won" smallint NOT NULL,
	"lost" smallint NOT NULL,
	"sets_won" smallint NOT NULL,
	"sets_lost" smallint NOT NULL,
	"points_won" integer NOT NULL,
	"points_lost" integer NOT NULL,
	"table_points" smallint NOT NULL,
	CONSTRAINT "standings_phase_team" UNIQUE("phase_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" text NOT NULL,
	"season_id" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	CONSTRAINT "teams_club_season" UNIQUE("club_id","season_id")
);
--> statement-breakpoint
ALTER TABLE "box_score_lines" ADD CONSTRAINT "box_score_lines_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_score_lines" ADD CONSTRAINT "box_score_lines_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_score_lines" ADD CONSTRAINT "box_score_lines_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_mvp_player_id_players_id_fk" FOREIGN KEY ("mvp_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_scores" ADD CONSTRAINT "set_scores_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_refs" ADD CONSTRAINT "source_refs_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "box_score_lines_player_idx" ON "box_score_lines" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "matches_season_idx" ON "matches" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "matches_phase_idx" ON "matches" USING btree ("phase_id");