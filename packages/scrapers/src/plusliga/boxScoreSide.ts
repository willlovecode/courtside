export interface SideMatch {
  homeName: string;
  awayName: string;
  homeClubSiteId: string;
  awayClubSiteId: string;
}

const normalise = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Which side of a Match a Box score row belongs to. The row names the Player's own
 * Team first and the opponent second, as the Season's Team names. When the own name
 * is not one of the two (a sponsor renamed the Team mid-season), the opponent's name
 * rules out one side; failing that, the Club the Player was registered with in
 * that Season decides, if it is only one of the two.
 */
export function resolveBoxScoreSide(
  row: { teamName: string; opponentName: string },
  match: SideMatch,
  playerClubSiteIds: string[],
): "home" | "away" | null {
  const own = normalise(row.teamName);
  const opponent = normalise(row.opponentName);
  const home = normalise(match.homeName);
  const away = normalise(match.awayName);

  if (own === home && own !== away) return "home";
  if (own === away && own !== home) return "away";
  if (opponent === away && opponent !== home) return "home";
  if (opponent === home && opponent !== away) return "away";

  const atHome = playerClubSiteIds.includes(match.homeClubSiteId);
  const atAway = playerClubSiteIds.includes(match.awayClubSiteId);
  if (atHome && !atAway) return "home";
  if (atAway && !atHome) return "away";
  return null;
}
