import type { LeagueStats } from "@courtside/db";

export interface BoxScoreCore {
  setsPlayed: number;
  points: number;
  attackPoints: number;
  aces: number;
  blocks: number;
  errors: number;
}

/**
 * PlusLiga columns that feed the shared Box score core:
 *   setsPlayed   = Sety
 *   points       = Punkty Suma
 *   attackPoints = Atak Pkt
 *   aces         = Zagrywka As
 *   blocks       = Blok Pkt
 *   errors       = Zagrywka Błąd + Przyjęcie Błąd + Atak Błąd + Atak Blok (attacks blocked)
 * The four error parts stay in leagueStats because errors is their sum; the other
 * columns that map one-to-one live only in the core.
 */
const directColumns = {
  setsPlayed: "Sety",
  points: "Punkty Suma",
  attackPoints: "Atak Pkt",
  aces: "Zagrywka As",
  blocks: "Blok Pkt",
} as const;

const errorColumns = ["Zagrywka Błąd", "Przyjęcie Błąd", "Atak Błąd", "Atak Blok"] as const;

function requireColumn(stats: Record<string, number | null>, label: string): number {
  const value = stats[label];
  if (value === undefined) throw new Error(`Box score column "${label}" is missing`);
  // A dash means the Player had no such action.
  return value ?? 0;
}

export function mapBoxScore(stats: Record<string, number | null>): { core: BoxScoreCore; leagueStats: LeagueStats } {
  const core: BoxScoreCore = {
    setsPlayed: requireColumn(stats, directColumns.setsPlayed),
    points: requireColumn(stats, directColumns.points),
    attackPoints: requireColumn(stats, directColumns.attackPoints),
    aces: requireColumn(stats, directColumns.aces),
    blocks: requireColumn(stats, directColumns.blocks),
    errors: errorColumns.reduce((sum, label) => sum + requireColumn(stats, label), 0),
  };

  const mapped = new Set<string>(Object.values(directColumns));
  const leagueStats: LeagueStats = {};
  for (const [label, value] of Object.entries(stats)) {
    if (!mapped.has(label)) leagueStats[label] = value;
  }
  return { core, leagueStats };
}
