# Courtside

A portfolio website for current professional volleyball: leagues, matches, standings, clubs, players and transfers, presented with care.

Independent, non-commercial fan project. All data comes from the leagues' official websites, which each page links back to.

## Scope

- Men's top divisions of Germany (1. Bundesliga), Italy (SuperLega), Poland (PlusLiga, sponsored as TAURON Liga), Turkey (Efeler Ligi) and Japan (SV.League). Women's leagues come later.
- No second divisions, cups or European competitions yet.
- Site language is English.
- No live scores yet: data refreshes a few times a day.

## Order of work

1. Throwaway clickable prototype of Home, League and Match pages on mock data, to settle the look.
2. League scrapers in this order: Poland, Italy, Japan, Germany, Turkey.
3. Transfers detected from Roster changes.
4. Later: news (headline, summary, link), women's leagues, live scores.

Raw fetched pages and club logos are stored in Cloudflare R2, not in git.

## Docs

- `GLOSSARY.md`: the domain language.
- `docs/adr/`: decisions and why they were made.
