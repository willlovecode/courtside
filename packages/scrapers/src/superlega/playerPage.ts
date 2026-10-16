import { loadPage, textOf } from "../html";

export interface PlayerPage {
  /** "Surname Name" as the site writes it. */
  name: string;
  /** "08/04/2005" */
  birthDate: string | null;
  height: number | null;
  /** The sporting nationality, e.g. "ITA". */
  nationality: string | null;
  role: string | null;
}

export function parsePlayerPage(html: string): PlayerPage {
  const page = loadPage(html);
  const labels = new Map<string, string>();
  page(".atleta-label").each((_, el) => {
    const node = page(el);
    const label = textOf(node.children(".label"));
    const value = textOf(node.clone().children(".label").remove().end());
    if (label && !labels.has(label)) labels.set(label, value);
  });

  const height = /(\d+)\s*cm/.exec(labels.get("Altezza") ?? "")?.[1];
  return {
    name: textOf(page(".atleta-nome").first()),
    birthDate: /^\d{2}\/\d{2}\/\d{4}$/.test(labels.get("Nascita") ?? "") ? (labels.get("Nascita") ?? null) : null,
    height: height ? Number(height) : null,
    nationality: labels.get("Naz.Sportiva") || null,
    role: labels.get("Ruolo") || null,
  };
}
