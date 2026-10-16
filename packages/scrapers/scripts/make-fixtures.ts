/**
 * Copies a few snapshots into test/fixtures/<league>, cutting what parsing never reads
 * (scripts, styles, navigation, embedded images, cookie dialog, sliders). Parsed output
 * must not change, which the script checks before writing.
 *
 *   npx tsx packages/scrapers/scripts/make-fixtures.ts [plusliga|superlega]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import * as cheerio from "cheerio";
import { pageKinds as plusLigaKinds } from "../src/plusliga/config";
import { parseMatchList } from "../src/plusliga/matchList";
import { parseMatchPage } from "../src/plusliga/matchPage";
import { parsePlayerPage } from "../src/plusliga/playerPage";
import { snapshotKey } from "../src/plusliga/snapshots";
import { parseFinalStandings } from "../src/plusliga/standingsTable";
import { parseTeamIndex, parseTeamPage } from "../src/plusliga/teamPage";
import { FileSnapshotStore, type SnapshotKey } from "../src/snapshots";
import { pageKinds as superLegaKinds } from "../src/superlega/config";
import { parseMatchPage as parseItalianMatchPage } from "../src/superlega/matchPage";
import { parsePlayerPage as parseItalianPlayerPage } from "../src/superlega/playerPage";
import { parseBracketMatchIds, parseResultsPage } from "../src/superlega/resultsPage";
import { snapshotKey as italianKey } from "../src/superlega/snapshots";
import { parseStandings } from "../src/superlega/standingsPage";
import { parseTeamPage as parseItalianTeamPage } from "../src/superlega/teamPage";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");

const cuts = [
  "script",
  "style",
  "noscript",
  "link",
  "meta",
  "svg",
  "iframe",
  "nav",
  "footer",
  "img[src^='data:']",
  ".cokie-manager",
  ".games-slider",
  ".share-bar",
  ".dc-slider",
  ".related-news",
  ".td-header-wrap",
  "#td-outer-wrap > .td-footer-template-wrap",
  ".td-footer-wrapper",
];

function trim(html: string): string {
  const $ = cheerio.load(html);
  $(cuts.join(",")).remove();
  $("*")
    .contents()
    .filter((_, node) => node.type === "comment")
    .remove();
  return $.html().replace(/>\s+</g, "><").replace(/\n\s*\n/g, "\n");
}

interface Fixture {
  name: string;
  key: SnapshotKey;
  parse: (html: string) => unknown;
}

const fixtures: Record<string, Fixture[]> = {
  plusliga: [
    { name: "matchlist.html", key: snapshotKey("2025-26", plusLigaKinds.matchList, "all"), parse: parseMatchList },
    { name: "standings.html", key: snapshotKey("2025-26", plusLigaKinds.standings, "final"), parse: parseFinalStandings },
    { name: "teams-index.html", key: snapshotKey("2025-26", plusLigaKinds.teamIndex, "index"), parse: parseTeamIndex },
    { name: "team-2.html", key: snapshotKey("2025-26", plusLigaKinds.team, "2"), parse: parseTeamPage },
    { name: "match-1104534.html", key: snapshotKey("2025-26", plusLigaKinds.match, "1104534"), parse: parseMatchPage },
    { name: "player-1453.html", key: snapshotKey("2025-26", plusLigaKinds.player, "1453"), parse: parsePlayerPage },
  ],
  superlega: [
    { name: "results-root.html", key: italianKey("2025-26", superLegaKinds.resultsRoot, "root"), parse: parseResultsPage },
    { name: "results-ritorno-1.html", key: italianKey("2025-26", superLegaKinds.results, "974-2-8265"), parse: parseResultsPage },
    { name: "bracket-playoffs.html", key: italianKey("2025-26", superLegaKinds.bracket, "991"), parse: parseBracketMatchIds },
    { name: "bracket-placement.html", key: italianKey("2025-26", superLegaKinds.bracket, "995"), parse: parseBracketMatchIds },
    { name: "standings.html", key: italianKey("2025-26", superLegaKinds.standings, "final"), parse: parseStandings },
    { name: "match-39343.html", key: italianKey("2025-26", superLegaKinds.match, "39343"), parse: parseItalianMatchPage },
    { name: "match-40122.html", key: italianKey("2025-26", superLegaKinds.match, "40122"), parse: parseItalianMatchPage },
    { name: "team-6707.html", key: italianKey("2025-26", superLegaKinds.team, "6707"), parse: parseItalianTeamPage },
    { name: "player-BIS-ALE-05.html", key: italianKey("2025-26", superLegaKinds.player, "BIS-ALE-05"), parse: parseItalianPlayerPage },
  ],
};

const store = new FileSnapshotStore();
const wanted = process.argv[2] ? [process.argv[2]] : Object.keys(fixtures);
for (const league of wanted) {
  const list = fixtures[league];
  if (!list) throw new Error(`Unknown league ${league}`);
  const outDir = path.join(fixturesDir, league);
  await mkdir(outDir, { recursive: true });
  for (const { name, key, parse } of list) {
    const snapshot = await store.get(key);
    if (!snapshot) throw new Error(`No snapshot for ${key.kind}/${key.id}; run the fetch step first`);
    const trimmed = trim(snapshot.body);
    if (!isDeepStrictEqual(parse(snapshot.body), parse(trimmed))) throw new Error(`Trimming changed what ${name} parses to`);
    await writeFile(path.join(outDir, name), trimmed, "utf8");
    console.log(`${league}/${name}: ${snapshot.body.length} -> ${trimmed.length} bytes`);
  }
}
