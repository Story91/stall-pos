/**
 * Calendar-date helpers for business dates (`YYYY-MM-DD`).
 *
 * Business dates are calendar dates in the business timezone, not UTC dates.
 */

/** Returns the `YYYY-MM-DD` calendar date of `now` in timezone `tz`. Throws RangeError on an invalid tz. */
export function businessDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Returns the `YYYY-MM-DD` date `n` days before `date`.
 * Pure calendar arithmetic in UTC, so DST and the machine timezone have no effect.
 */
export function daysAgo(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

/** Milliseconds the wall clock in `tz` is ahead of UTC at instant `at` (negative west of UTC). */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `tz` reads `minutes` past midnight on
 * business date `date`. DST-aware: Chicago is UTC-5 in summer and UTC-6 in winter.
 */
export function zonedTime(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  // Guess with the offset at the wall time read as UTC, then correct once for a DST change in between.
  let at = wall - tzOffsetMs(new Date(wall), tz);
  at = wall - tzOffsetMs(new Date(at), tz);
  return new Date(at);
}
