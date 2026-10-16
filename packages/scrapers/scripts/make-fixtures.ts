/**
 * Copies a few snapshots into test/fixtures/plusliga, cutting what parsing never reads
 * (scripts, styles, navigation, cookie dialog, sliders). Parsed output must not change,
 * which the script checks before writing.
 *
 *   npx tsx packages/scrapers/scripts/make-fixtures.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { isDeepStrictEqual } from "node:util";
import { FileSnapshotStore } from "../src/snapshots";
import { pageKinds } from "../src/plusliga/config";
import { snapshotKey } from "../src/plusliga/snapshots";
import { parseMatchList } from "../src/plusliga/matchList";
import { parseMatchPage } from "../src/plusliga/matchPage";
import { parsePlayerPage } from "../src/plusliga/playerPage";
import { parseFinalStandings } from "../src/plusliga/standingsTable";
import { parseTeamIndex, parseTeamPage } from "../src/plusliga/teamPage";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "plusliga");

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
  "form",
  ".cokie-manager",
  ".games-slider",
  ".share-bar",
  ".dc-slider",
  ".related-news",
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

const store = new FileSnapshotStore();
const fixtures: { name: string; key: ReturnType<typeof snapshotKey>; parse: (html: string) => unknown }[] = [
  { name: "matchlist.html", key: snapshotKey("2025-26", pageKinds.matchList, "all"), parse: parseMatchList },
  { name: "standings.html", key: snapshotKey("2025-26", pageKinds.standings, "final"), parse: parseFinalStandings },
  { name: "teams-index.html", key: snapshotKey("2025-26", pageKinds.teamIndex, "index"), parse: parseTeamIndex },
  { name: "team-2.html", key: snapshotKey("2025-26", pageKinds.team, "2"), parse: parseTeamPage },
  { name: "match-1104534.html", key: snapshotKey("2025-26", pageKinds.match, "1104534"), parse: parseMatchPage },
  { name: "player-1453.html", key: snapshotKey("2025-26", pageKinds.player, "1453"), parse: parsePlayerPage },
];

await mkdir(outDir, { recursive: true });
for (const { name, key, parse } of fixtures) {
  const snapshot = await store.get(key);
  if (!snapshot) throw new Error(`No snapshot for ${key.kind}/${key.id}; run the fetch step first`);
  const trimmed = trim(snapshot.body);
  if (!isDeepStrictEqual(parse(snapshot.body), parse(trimmed))) throw new Error(`Trimming changed what ${name} parses to`);
  await writeFile(path.join(outDir, name), trimmed, "utf8");
  console.log(`${name}: ${snapshot.body.length} -> ${trimmed.length} bytes`);
}
