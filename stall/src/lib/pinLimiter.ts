// In-memory brute-force guard for the owner PIN. One process (Render web service),
// so module state is enough; a restart clears it, which only helps the owner.

const WINDOW_MS = 10 * 60_000;
const MAX_FAILURES = 5;
const FIRST_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;

type Bucket = { failures: number[]; lockedUntil: number; lastLockMs: number };
const buckets = new Map<string, Bucket>();
let queue: Promise<unknown> = Promise.resolve();

/** "global" always; "ip:<first x-forwarded-for hop>" when the header is present. */
export function limiterKeys(request: Request): string[] {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip ? ["global", `ip:${ip}`] : ["global"];
}

/** Seconds left on the longest active lock among `keys`, or null when none is locked. */
export function pinLock(keys: string[], now: number): number | null {
  let until = 0;
  for (const key of keys) until = Math.max(until, buckets.get(key)?.lockedUntil ?? 0);
  return until > now ? Math.ceil((until - now) / 1000) : null;
}

/** Records a wrong PIN; the 5th failure inside 10 minutes locks, 30 s doubling to 15 min. */
export function recordPinFailure(keys: string[], now: number): void {
  for (const key of keys) {
    const bucket = buckets.get(key) ?? { failures: [], lockedUntil: 0, lastLockMs: 0 };
    bucket.failures = [...bucket.failures.filter((t) => now - t < WINDOW_MS), now];
    if (bucket.failures.length >= MAX_FAILURES) {
      bucket.lastLockMs = bucket.lastLockMs === 0 ? FIRST_LOCK_MS : Math.min(bucket.lastLockMs * 2, MAX_LOCK_MS);
      bucket.lockedUntil = now + bucket.lastLockMs;
      bucket.failures = [];
    }
    buckets.set(key, bucket);
  }
}

/** The right PIN clears the counters and the backoff. */
export function recordPinSuccess(keys: string[]): void {
  for (const key of keys) buckets.delete(key);
}

/** Runs PIN checks one at a time, so a burst of parallel guesses queues behind each delay. */
export function serializePinCheck<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

/** Tests only. */
export function resetPinLimiter(): void {
  buckets.clear();
  queue = Promise.resolve();
}
