# Courtside

A portfolio website for current professional volleyball: leagues, matches, standings, clubs, players and transfers, presented with care.

Independent, non-commercial fan project. All data comes from the leagues' official websites, which each page links back to.

## Scope

- Men's top divisions of Germany (1. Bundesliga), Italy (SuperLega), Poland (PlusLiga, sponsored as TAURON Liga), Turkey (Efeler Ligi) and Japan (SV.League). Women's leagues come later.
- No second divisions, cups or European competitions yet.
- Site language is English.
- No live scores yet: data refreshes a few times a day.
- The first build covers the finished 2025-26 Season; the current Season follows once the pipeline works.

## Pages

- **Home:** recent results and next matches across all Leagues, a mini table per League, latest Transfers.
- **Match:** Teams, time, venue, result and set scores everywhere; box score and MVP where the League publishes them.
- **Player:** position, height, date of birth, nationality, current Team, Season stats where published, Transfer history. Portraits only from FIVB VIS, initials otherwise.
- Stats are shown within their own League only; no cross-League leaderboards until definitions are confirmed to match.
- Times are shown in the viewer's time zone, with League-local time alongside.
- URLs use lasting names, never sponsor names: `/leagues/superlega/2025-26`, `/clubs/trentino-volley`, `/players/kamil-semeniuk`, `/matches/<date>-<home>-<away>`.

Look: "control room", chosen from a two-variant prototype (branch `prototype/broadcast-ui`, `prototype/ui-variants.html`, variant B). Dark only: graphite background, LED amber for home and highlights, cyan for away, IBM Plex Mono for figures and IBM Plex Sans Condensed for names. A league rail on the left, dense bordered panels, set scores as cells shaded by margin, a results grid per League, a position-by-round chart, per-set lead-by-rally charts on the Match page, and one combined box score.

Stack: TypeScript monorepo (Next.js site, scrapers and a shared Drizzle schema), Neon Postgres, Vercel, GitHub Actions for scheduled runs.

## Order of work

1. Throwaway clickable prototype of Home, League and Match pages on mock data, to settle the look. Reference: Volleyball World's VNL broadcast graphics; two variants.
2. League scrapers in this order: Poland, Italy, Japan, Germany, Turkey. The 2025-26 Season in full, plus 2026-27 Rosters.
3. Transfers detected from Roster changes between 2025-26 and 2026-27.
4. Later: news (headline, summary, link), women's leagues, live scores.

Raw fetched pages and club logos are stored in Cloudflare R2, not in git.

## Scrapers

Each League has one adapter with four separate steps:

1. **fetch** downloads pages and stores them as snapshots.
2. **parse** turns a snapshot into Matches, Standings, Teams and Players. It never touches the network, so a fixed parser is re-run on stored snapshots.
3. **load** upserts into Postgres.
4. **check** runs plausibility rules: every Team has a Roster of at least 12 Players, every finished Match has 3 to 5 valid sets (25 points with a 2-point margin, 15 in the fifth), and the Match count fits the League's format.

Per League, as of October 2026:

- **Poland** (tauronliga.pl): plain HTML, using the `nocookies/1` URL variants. Season 2025-26 is tour 52, 2026-27 is tour 53. Match pages carry sets and facts; their per-player stats are an embedded Volleystation widget (blocked), so Box scores come from each Player's page, which lists one row per Match. A Player who left mid-season and is on no final Roster is therefore missing. No nationality is published.
- **Japan** (svleague.jp): plain HTML, season selector `s=2025`. No published Season stats, so Season totals are summed from Box scores.
- **Italy** (legavolley.it): the 2025-26 archive is still to be located, possibly through the site's own data requests.
- **Germany** (volleyball-bundesliga.de): rendered with Playwright; plain requests return an empty SAMS shell.
- **Turkey**: out of the MVP, see ADR 0001.

Every mapping of a League's columns onto the shared Box score core is tested against a real page.

Runs start by hand from the command line while we work on the finished 2025-26 Season. Scheduled GitHub Actions runs, which open an issue when a check fails, come with the live Season. Parsers are tested with Vitest against a few real pages per page type committed to the repo.

## Development

Node 24 and npm. `npm install` sets up the workspaces: `packages/db` (Drizzle schema and client) and `packages/scrapers` (League adapters and the CLI). The web app is not scaffolded yet.

- `npm run check`: ESLint, `tsc --noEmit` in every workspace, then Vitest.
- `npm run scrape -- --league plusliga --season 2025-26 [--step fetch|parse|load|check|all] [--refresh]`: runs the four scraper steps (default `all`). Pages that already have a snapshot are skipped unless `--refresh` is given. The Season also brings the 2026-27 Rosters.
- `npm run db:push`: applies the SQL migrations in `packages/db/drizzle`. Scrape runs do this themselves. After editing `packages/db/src/schema.ts`, run `npm run db:generate` to write a new migration.

Local data lives in `.data/` (git-ignored): raw pages in `.data/snapshots/<league>/<season>/<page-kind>/<id>.html` with a `.json` sidecar (URL, fetch time, status), parse output in `.data/parsed/`, and the PGlite database in `.data/pglite/`. Setting `DATABASE_URL` to a Postgres (Neon) connection string loads there instead.

## MVP is done when

- The site is live on a `*.vercel.app` address.
- Poland, Italy, Japan and Germany each have one Season complete: every Match with set scores, final Standings per Phase, Rosters, Club and Player pages. That Season is 2025-26, except for Italy if its site no longer serves 2025-26, in which case Italy counts with 2026-27. Turkey is out of the MVP (see ADR 0001).
- The summer 2026 Transfers are listed.
- `npm run check` (lint, types, tests, build) passes and the health checks pass for every loaded League.

## Docs

- `GLOSSARY.md`: the domain language.
- `docs/adr/`: decisions and why they were made.
