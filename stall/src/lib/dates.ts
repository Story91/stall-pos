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
