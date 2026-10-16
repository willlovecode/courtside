/** Plausibility rules over loaded data. Pure, so they can be tested without a database. */

export interface CheckTeam {
  id: string;
  name: string;
  rosterSize: number;
}

export interface CheckSet {
  setNumber: number;
  homePoints: number;
  awayPoints: number;
}

export interface CheckMatch {
  id: string;
  phaseId: string;
  roundId: string;
  homeTeamId: string;
  awayTeamId: string;
  status: "scheduled" | "finished";
  homeSetsWon: number | null;
  awaySetsWon: number | null;
  sets: CheckSet[];
  /** Teams that have at least one Box score line in this Match. */
  boxScoreTeamIds: string[];
}

export interface CheckStanding {
  teamId: string;
  position: number;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
  tablePoints: number;
}

export interface CheckPhase {
  id: string;
  kind: string;
  name: string;
  roundCount: number;
}

export interface CheckSeason {
  label: string;
  teams: CheckTeam[];
  phases: CheckPhase[];
  matches: CheckMatch[];
  /** Loaded Standings, by Phase id. */
  standings: Map<string, CheckStanding[]>;
}

export type Level = "fail" | "warn";

export interface Finding {
  level: Level;
  message: string;
}

export interface RuleResult {
  rule: string;
  findings: Finding[];
}

export const minRosterSize = 12;

export function setTarget(setNumber: number): number {
  return setNumber === 5 ? 15 : 25;
}

/** A set is won at the target with a 2-point margin; beyond the target it ends exactly 2 ahead. */
export function isValidSet(set: CheckSet): boolean {
  const high = Math.max(set.homePoints, set.awayPoints);
  const low = Math.min(set.homePoints, set.awayPoints);
  const target = setTarget(set.setNumber);
  if (high < target || high - low < 2) return false;
  return high === target || high - low === 2;
}

export function rosterRule(season: CheckSeason): RuleResult {
  const findings: Finding[] = season.teams
    .filter((t) => t.rosterSize < minRosterSize)
    .map((t) => ({ level: "fail", message: `${t.name} has ${t.rosterSize} Players on its Roster, expected at least ${minRosterSize}` }));
  return { rule: `${season.label}: every Team has a Roster of at least ${minRosterSize} Players`, findings };
}

export function matchSetsRule(season: CheckSeason): RuleResult {
  const findings: Finding[] = [];
  const fail = (match: CheckMatch, message: string) => findings.push({ level: "fail", message: `Match ${match.id}: ${message}` });

  for (const match of season.matches.filter((m) => m.status === "finished")) {
    const sets = [...match.sets].sort((a, b) => a.setNumber - b.setNumber);
    if (sets.length < 3 || sets.length > 5) fail(match, `${sets.length} sets, expected 3 to 5`);
    let home = 0;
    let away = 0;
    sets.forEach((set, i) => {
      if (set.setNumber !== i + 1) fail(match, `set numbers are not 1..${sets.length}`);
      if (!isValidSet(set)) fail(match, `set ${set.setNumber} ended ${set.homePoints}:${set.awayPoints}`);
      // The last set must decide the Match: nobody may have 3 sets before it.
      if (home === 3 || away === 3) fail(match, `set ${set.setNumber} was played after the Match was decided`);
      if (set.homePoints > set.awayPoints) home++;
      else away++;
    });

    if (home !== match.homeSetsWon || away !== match.awaySetsWon) {
      fail(match, `set scores give ${home}:${away} but the Match says ${match.homeSetsWon}:${match.awaySetsWon}`);
    }
    if (Math.max(home, away) !== 3 || Math.min(home, away) > 2) fail(match, `${home}:${away} has no winner with 3 sets`);
  }
  return { rule: `${season.label}: finished Matches have 3-5 valid sets and the winner won 3`, findings };
}

/** The first Phase of kind "regular" is a double round robin among the Season's Teams. */
export function regularSeasonFormatRule(season: CheckSeason): RuleResult {
  const findings: Finding[] = [];
  const phase = season.phases.find((p) => p.kind === "regular");
  const rule = `${season.label}: the regular season is a double round robin`;
  if (!phase) return { rule, findings: [{ level: "fail", message: "no regular season Phase" }] };

  const matches = season.matches.filter((m) => m.phaseId === phase.id);
  // The number of Teams comes from the Season, so a Team missing from every Match shows up as a gap.
  const teamIds = new Set(season.teams.map((t) => t.id));
  const teams = teamIds.size;
  for (const m of matches) {
    for (const id of [m.homeTeamId, m.awayTeamId]) {
      if (!teamIds.has(id)) findings.push({ level: "fail", message: `Match ${m.id} has a Team (${id}) that is not in the Season` });
    }
  }
  const rounds = 2 * (teams - 1);
  const expected = (teams * rounds) / 2;
  if (matches.length !== expected) {
    findings.push({ level: "fail", message: `${matches.length} Matches, expected ${teams} Teams x ${rounds} Rounds / 2 = ${expected}` });
  }
  if (phase.roundCount !== rounds) findings.push({ level: "fail", message: `${phase.roundCount} Rounds, expected ${rounds}` });

  const perRound = new Map<string, number>();
  for (const m of matches) perRound.set(m.roundId, (perRound.get(m.roundId) ?? 0) + 1);
  for (const [roundId, count] of perRound) {
    if (count !== teams / 2) findings.push({ level: "fail", message: `Round ${roundId} has ${count} Matches, expected ${teams / 2}` });
  }

  const pairings = new Map<string, number>();
  for (const m of matches) {
    const key = `${m.homeTeamId}>${m.awayTeamId}`;
    pairings.set(key, (pairings.get(key) ?? 0) + 1);
  }
  for (const [key, count] of pairings) {
    if (count !== 1) findings.push({ level: "fail", message: `${key} is played ${count} times, expected once` });
  }
  return { rule, findings };
}

/** Standings as the table is computed: a 3-0 or 3-1 win earns 3, a 3-2 win 2, a 3-2 loss 1. */
export function computeStandings(matches: CheckMatch[], teamIds: string[]): CheckStanding[] {
  const rows = new Map<string, CheckStanding>(
    teamIds.map((teamId) => [
      teamId,
      { teamId, position: 0, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, pointsWon: 0, pointsLost: 0, tablePoints: 0 },
    ]),
  );

  for (const m of matches.filter((x) => x.status === "finished")) {
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away || m.homeSetsWon === null || m.awaySetsWon === null) continue;
    const homeWon = m.homeSetsWon > m.awaySetsWon;
    const [winner, loser] = homeWon ? [home, away] : [away, home];
    const [winnerSets, loserSets] = homeWon ? [m.homeSetsWon, m.awaySetsWon] : [m.awaySetsWon, m.homeSetsWon];

    for (const row of [home, away]) row.played++;
    winner.won++;
    loser.lost++;
    winner.tablePoints += loserSets === 2 ? 2 : 3;
    loser.tablePoints += loserSets === 2 ? 1 : 0;
    winner.setsWon += winnerSets;
    winner.setsLost += loserSets;
    loser.setsWon += loserSets;
    loser.setsLost += winnerSets;
    for (const set of m.sets) {
      home.pointsWon += set.homePoints;
      home.pointsLost += set.awayPoints;
      away.pointsWon += set.awayPoints;
      away.pointsLost += set.homePoints;
    }
  }

  // Order: table points, wins, set ratio, point ratio (ratios compared by cross-multiplying).
  const ranked = [...rows.values()].sort(
    (a, b) =>
      b.tablePoints - a.tablePoints ||
      b.won - a.won ||
      b.setsWon * a.setsLost - a.setsWon * b.setsLost ||
      b.pointsWon * a.pointsLost - a.pointsWon * b.pointsLost,
  );
  ranked.forEach((row, i) => (row.position = i + 1));
  return ranked;
}

const standingFields = ["played", "won", "lost", "setsWon", "setsLost", "pointsWon", "pointsLost", "tablePoints", "position"] as const;

export function standingsRule(season: CheckSeason): RuleResult {
  const findings: Finding[] = [];
  const phase = season.phases.find((p) => p.kind === "regular");
  const rule = `${season.label}: loaded Standings agree with Standings computed from Matches`;
  if (!phase) return { rule, findings: [{ level: "fail", message: "no regular season Phase" }] };

  const loaded = season.standings.get(phase.id) ?? [];
  if (loaded.length === 0) return { rule, findings: [{ level: "fail", message: "no Standings loaded" }] };

  const names = new Map(season.teams.map((t) => [t.id, t.name]));
  const computed = new Map(
    computeStandings(
      season.matches.filter((m) => m.phaseId === phase.id),
      loaded.map((s) => s.teamId),
    ).map((s) => [s.teamId, s]),
  );
  for (const row of loaded) {
    const mine = computed.get(row.teamId);
    if (!mine) continue;
    const diffs = standingFields.filter((f) => row[f] !== mine[f]).map((f) => `${f} ${row[f]} vs computed ${mine[f]}`);
    if (diffs.length > 0) findings.push({ level: "fail", message: `${names.get(row.teamId) ?? row.teamId}: ${diffs.join(", ")}` });
  }
  return { rule, findings };
}

export function boxScoreRule(season: CheckSeason): RuleResult {
  const findings: Finding[] = [];
  for (const m of season.matches.filter((x) => x.status === "finished")) {
    const missing = [m.homeTeamId, m.awayTeamId].filter((t) => !m.boxScoreTeamIds.includes(t));
    if (missing.length > 0) findings.push({ level: "warn", message: `Match ${m.id} has no Box score lines for ${missing.join(", ")}` });
  }
  return { rule: `${season.label}: finished Matches have Box score lines for both Teams`, findings };
}

/** Runs the rules that apply to what the Season contains. */
export function runRules(season: CheckSeason): RuleResult[] {
  const results = [rosterRule(season)];
  if (season.matches.length > 0) {
    results.push(regularSeasonFormatRule(season), matchSetsRule(season), standingsRule(season), boxScoreRule(season));
  }
  return results;
}
