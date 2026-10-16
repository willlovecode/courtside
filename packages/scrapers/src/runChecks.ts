import { eq, inArray } from "drizzle-orm";
import { schema, type Database } from "@courtside/db";
import { runRules, type CheckMatch, type CheckSeason, type CheckStanding, type RuleResult } from "./checks";

const s = schema;

/** Reads one loaded Season back from the database in the shape the rules expect. */
export async function readSeasonForChecks(db: Database, leagueId: string, label: string): Promise<CheckSeason | null> {
  const seasons = await db.select().from(s.seasons).where(eq(s.seasons.leagueId, leagueId));
  const row = seasons.find((x) => x.label === label);
  if (!row) return null;

  const teams = await db.select().from(s.teams).where(eq(s.teams.seasonId, row.id));
  const teamIds = teams.map((t) => t.id);
  const roster = teamIds.length ? await db.select().from(s.rosterEntries).where(inArray(s.rosterEntries.teamId, teamIds)) : [];
  const phases = await db.select().from(s.phases).where(eq(s.phases.seasonId, row.id));
  const phaseIds = phases.map((p) => p.id);
  const rounds = phaseIds.length ? await db.select().from(s.rounds).where(inArray(s.rounds.phaseId, phaseIds)) : [];
  const matchRows = await db.select().from(s.matches).where(eq(s.matches.seasonId, row.id));
  const matchIds = matchRows.map((m) => m.id);
  const sets = matchIds.length ? await db.select().from(s.setScores).where(inArray(s.setScores.matchId, matchIds)) : [];
  const boxTeams = matchIds.length
    ? await db
        .selectDistinct({ matchId: s.boxScoreLines.matchId, teamId: s.boxScoreLines.teamId })
        .from(s.boxScoreLines)
        .where(inArray(s.boxScoreLines.matchId, matchIds))
    : [];
  const standingRows = phaseIds.length ? await db.select().from(s.standings).where(inArray(s.standings.phaseId, phaseIds)) : [];

  const matches: CheckMatch[] = matchRows.map((m) => ({
    id: m.id,
    phaseId: m.phaseId,
    roundId: m.roundId,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    status: m.status,
    homeSetsWon: m.homeSetsWon,
    awaySetsWon: m.awaySetsWon,
    sets: sets.filter((x) => x.matchId === m.id),
    boxScoreTeamIds: boxTeams.filter((b) => b.matchId === m.id).map((b) => b.teamId),
  }));

  const standings = new Map<string, CheckStanding[]>();
  for (const st of standingRows) standings.set(st.phaseId, [...(standings.get(st.phaseId) ?? []), st]);

  return {
    label,
    teams: teams.map((t) => ({ id: t.id, name: t.name, rosterSize: roster.filter((r) => r.teamId === t.id).length })),
    phases: phases.map((p) => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      roundCount: rounds.filter((r) => r.phaseId === p.id).length,
    })),
    matches,
    standings,
  };
}

export interface CheckReport {
  results: RuleResult[];
  failures: number;
  warnings: number;
}

export async function checkSeasons(db: Database, leagueId: string, labels: string[]): Promise<CheckReport> {
  const results: RuleResult[] = [];
  for (const label of labels) {
    const season = await readSeasonForChecks(db, leagueId, label);
    if (!season) {
      results.push({ rule: `${label}: Season is loaded`, findings: [{ level: "fail", message: "not found in the database" }] });
      continue;
    }
    results.push(...runRules(season));
  }
  const count = (level: "fail" | "warn") =>
    results.reduce((n, r) => n + r.findings.filter((f) => f.level === level).length, 0);
  return { results, failures: count("fail"), warnings: count("warn") };
}

export function formatReport(report: CheckReport, maxExamples = 8): string {
  const lines: string[] = [];
  for (const { rule, findings } of report.results) {
    const fails = findings.filter((f) => f.level === "fail").length;
    const status = fails > 0 ? "FAIL" : findings.length > 0 ? "WARN" : "ok  ";
    lines.push(`${status} ${rule}${findings.length ? ` (${findings.length})` : ""}`);
    for (const finding of findings.slice(0, maxExamples)) lines.push(`       - ${finding.message}`);
    if (findings.length > maxExamples) lines.push(`       ... and ${findings.length - maxExamples} more`);
  }
  lines.push(`${report.failures} failures, ${report.warnings} warnings`);
  return lines.join("\n");
}
