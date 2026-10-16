# Official league sites are the only data source

All match, standing, club and player data is scraped from each league's own website (one adapter per league). Paid volleyball APIs (Highlightly, Broadage, API-Sports) offer fixtures and standings but no players or transfers, so we would need the scrapers anyway; dropping the API keeps the project at €0 and gives every league a single source, which avoids matching clubs and players across providers.

## Considered Options

- **Paid API for fixtures, scraping for players.** Rejected for now: two sources per league means identity matching, and the free tier (100 requests/day) can't do live scores either. Highlightly Pro ($5.99/month) stays the fallback if we want live scores later.
- **Ticker sites such as Flashscore.** Rejected: their robots.txt disallows the volleyball result and table pages, their terms forbid automated extraction, and the compiled data is protected under the EU database right (§87b UrhG). Not something a public portfolio project should rest on.
- **Asking the Volleyball Bundesliga for a SAMS API key.** Deliberately not done; Germany is scraped like the other leagues.

## Consequences

- Each league needs its own adapter; a site redesign breaks that league until the adapter is fixed, so every run is health-checked and raw pages are kept as snapshots so parsers can be re-run without refetching.
- Some sites render data client-side (Germany, Japan, Turkey via Volleystation) and need a headless browser.
- Fetch politely: a few runs a day, honest user agent, link back to the source.
- If a site blocks polite fetching, that League is dropped rather than worked around. Turkey, served through Volleystation, is the likeliest case.
