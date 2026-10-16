import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

export type Page = CheerioAPI;
export type Nodes = Cheerio<AnyNode>;

export function loadPage(html: string): Page {
  return cheerio.load(html);
}

/** Visible text with runs of whitespace (including non-breaking spaces) collapsed. */
export function textOf(nodes: Nodes): string {
  return nodes.text().replace(/\s+/g, " ").trim();
}

/** Reads a number as printed on the site: "1 234", "-18%", "0,0885". Dashes and blanks are null. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s%]/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-" || cleaned === "···") return null;
  const value = Number(cleaned);
  if (Number.isNaN(value)) throw new Error(`Not a number: "${raw}"`);
  return value;
}

/** Id from a link such as /teams/id/45/tour/52.html. */
export function idFromHref(href: string | undefined, section: "teams" | "players" | "games"): string | null {
  if (!href) return null;
  const match = new RegExp(`/${section}/(?:action/show/)?id/(\\d+)`).exec(href);
  return match?.[1] ?? null;
}
