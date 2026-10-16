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
