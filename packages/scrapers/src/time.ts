/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Converts wall-clock time in `timeZone` to the UTC instant.
 * A time skipped by a clock change resolves to the instant just after the change.
 */
export function localToUtc(local: LocalDateTime, timeZone: string): Date {
  const wallAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  let instant = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  // The offset at the first guess can differ from the offset at the real instant around clock changes.
  instant = wallAsUtc - zoneOffsetMs(instant, timeZone);
  return new Date(instant);
}

/** Parses "19.11.2025, 17:30" as used on tauronliga.pl. */
export function parseDotDateTime(text: string): LocalDateTime {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) throw new Error(`Unrecognised date and time: "${text}"`);
  const [, day, month, year, hour, minute] = m.map(Number) as [number, number, number, number, number, number];
  return { year, month, day, hour, minute };
}

export function localDateString(local: LocalDateTime): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.year}-${pad(local.month)}-${pad(local.day)}`;
}
