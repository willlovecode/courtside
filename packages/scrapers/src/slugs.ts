export interface SlugRequest {
  id: string;
  /** The slug the adapter would like. */
  slug: string;
  /** Appended when the slug is taken by another row. */
  suffix: string;
}

/**
 * Gives every row a slug that is unique across the whole table, which may hold
 * several Leagues. A row that already has a slug keeps it, so URLs never change
 * when other rows are added or removed. A new row gets its wanted slug, or the
 * wanted slug plus a stable suffix when another row already uses it.
 *
 * @param existing id to slug of every row already stored
 */
export function resolveSlugs(requests: SlugRequest[], existing: Map<string, string>): Map<string, string> {
  const taken = new Set(existing.values());
  const resolved = new Map<string, string>();
  for (const request of [...requests].sort((a, b) => a.id.localeCompare(b.id))) {
    const kept = existing.get(request.id);
    if (kept !== undefined) {
      resolved.set(request.id, kept);
      continue;
    }
    let slug = request.slug;
    if (taken.has(slug)) slug = `${request.slug}-${request.suffix}`;
    for (let n = 2; taken.has(slug); n++) slug = `${request.slug}-${request.suffix}-${n}`;
    taken.add(slug);
    resolved.set(request.id, slug);
  }
  return resolved;
}

/** "plusliga-p1453" becomes "p1453": the id without its League prefix. */
export function withoutLeaguePrefix(id: string, leagueId: string): string {
  return id.startsWith(`${leagueId}-`) ? id.slice(leagueId.length + 1) : id;
}
