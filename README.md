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

1. Throwaway clickable prototype of Home, League and Match pages on mock data, to settle the look.
2. League scrapers in this order: Poland, Italy, Japan, Germany, Turkey.
3. Transfers detected from Roster changes.
4. Later: news (headline, summary, link), women's leagues, live scores.

Raw fetched pages and club logos are stored in Cloudflare R2, not in git.

## Docs

- `GLOSSARY.md`: the domain language.
- `docs/adr/`: decisions and why they were made.
