import type { LeagueStats, PlayerPosition } from "@courtside/db";
import type { BoxScoreRow } from "./matchPage";

export interface BoxScoreCore {
  setsPlayed: number;
  points: number;
  attackPoints: number;
  aces: number;
  blocks: number;
  errors: number;
}

/**
 * SuperLega columns that feed the shared Box score core:
 *   setsPlayed   = the SET cells that are filled (a number is the starting rotation slot, "*" a substitute)
 *   points       = Punti Tot
 *   attackPoints = Attacco Pt
 *   aces         = Battuta Pt
 *   blocks       = Muro Pt
 *   errors       = Battuta Err + Ricezione Err + Attacco Err + Attacco Mur (attacks blocked)
 * The four error parts stay in leagueStats because errors is their sum, as do the SET cells
 * ("Set 1" to "Set 5"). The unlabelled first column of Battuta, Ricezione and Attacco is the
 * number of actions and is called "Tot". A dot on the site means nothing was recorded and is null.
 */
const directColumns = ["Punti Tot", "Attacco Pt", "Battuta Pt", "Muro Pt"];
const errorColumns = ["Battuta Err", "Ricezione Err", "Attacco Err", "Attacco Mur"];

const sum = (stats: Record<string, number | null>, labels: string[]) =>
  labels.reduce((total, label) => {
    if (!(label in stats)) throw new Error(`Box score column "${label}" is missing`);
    return total + (stats[label] ?? 0);
  }, 0);

/** The core and league stats of one Player's row, or null if the Player never got on court. */
export function mapBoxScore(row: BoxScoreRow): { core: BoxScoreCore; leagueStats: LeagueStats } | null {
  const setsPlayed = row.setCells.filter((cell) => cell !== null).length;
  if (setsPlayed === 0) return null;

  const core: BoxScoreCore = {
    setsPlayed,
    points: sum(row.stats, ["Punti Tot"]),
    attackPoints: sum(row.stats, ["Attacco Pt"]),
    aces: sum(row.stats, ["Battuta Pt"]),
    blocks: sum(row.stats, ["Muro Pt"]),
    errors: sum(row.stats, errorColumns),
  };

  const leagueStats: LeagueStats = {};
  row.setCells.forEach((cell, i) => (leagueStats[`Set ${i + 1}`] = cell));
  for (const [label, value] of Object.entries(row.stats)) {
    if (!directColumns.includes(label)) leagueStats[label] = value;
  }
  return { core, leagueStats };
}

const positions: Record<string, PlayerPosition> = {
  Palleggiatore: "setter",
  Schiacciatore: "outside_hitter",
  Opposto: "opposite",
  Centrale: "middle_blocker",
  Libero: "libero",
};

export function mapPosition(italian: string | null | undefined): PlayerPosition | null {
  return italian ? (positions[italian.trim()] ?? null) : null;
}
