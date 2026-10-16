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

Look: dark broadcast scoreboard. Dense, monospace figures, TV-graphic feel.

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

Runs start by hand from the command line while we work on the finished 2025-26 Season. Scheduled GitHub Actions runs, which open an issue when a check fails, come with the live Season. Parsers are tested with Vitest against a few real pages per page type committed to the repo.

## MVP is done when

- The site is live on a `*.vercel.app` address.
- At least four of the five Leagues have their 2025-26 Season complete: every Match with set scores, final Standings per Phase, Rosters, Club and Player pages.
- The summer 2026 Transfers are listed.
- `npm run check` (lint, types, tests, build) passes and the health checks pass for every loaded League.

## Docs

- `GLOSSARY.md`: the domain language.
- `docs/adr/`: decisions and why they were made.
