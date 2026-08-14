/**
 * A token bucket, held in the instance's memory.
 *
 * Serverless means this is per-instance and best-effort: it cannot enforce a
 * global budget, and a cold start hands the caller a full bucket. What it does
 * do is stop one client from pinning one instance — which is the shape of the
 * risk on an unauthenticated endpoint that runs unindexed regex scans and a
 * whole-collection aggregation, and that POST semantics keep out of the CDN.
 */

export type RateLimitOptions = {
  /** Burst size: how many requests a caller may make back to back. */
  capacity: number
  /** Sustained rate, in tokens per second, once the burst is spent. */
  refillPerSecond: number
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

type Bucket = { tokens: number; updatedAt: number }

// Bounds the memory one instance can be made to hold. Refilled buckets go
// first, since evicting one grants nothing a fresh key would not already have;
// only when none have refilled does it fall back to evicting the least recently
// seen, which is a real (if small) amnesty and the price of a hard bound.
const MAX_TRACKED_KEYS = 10_000

const buckets = new Map<string, Bucket>()

export function consumeToken(
  key: string,
  options: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key) ?? { tokens: options.capacity, updatedAt: now }

  const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000
  const tokens = Math.min(
    options.capacity,
    bucket.tokens + elapsedSeconds * options.refillPerSecond,
  )

  if (tokens < 1) {
    buckets.set(key, { tokens, updatedAt: now })
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / options.refillPerSecond)),
    }
  }

  if (!buckets.has(key) && buckets.size >= MAX_TRACKED_KEYS) makeRoom(options, now)
  buckets.set(key, { tokens: tokens - 1, updatedAt: now })
  return { allowed: true }
}

/**
 * The caller's address as the platform reports it. `x-forwarded-for` is
 * attacker-controlled in general, but Vercel overwrites it at the edge, so the
 * leftmost entry is the real client there. Requests that arrive without one
 * share a single bucket rather than escaping the limit.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Free at least one slot, so the map cannot grow past the bound.
 *
 * Dropping only the refilled buckets is not enough on its own: under a flood of
 * distinct keys none of them refill, the sweep frees nothing, and inserts carry
 * on regardless. Whatever the sweep leaves behind, the oldest entries go until
 * there is room.
 */
function makeRoom(options: RateLimitOptions, now: number): void {
  for (const [key, bucket] of buckets) {
    const refilled = bucket.tokens + ((now - bucket.updatedAt) / 1000) * options.refillPerSecond
    if (refilled >= options.capacity) buckets.delete(key)
  }

  if (buckets.size < MAX_TRACKED_KEYS) return

  const byAge = [...buckets.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)
  for (const [key] of byAge.slice(0, buckets.size - MAX_TRACKED_KEYS + 1)) {
    buckets.delete(key)
  }
}

/** Test seam: drop all tracked buckets. */
export function resetRateLimits(): void {
  buckets.clear()
}

/** Test seam: how many callers are currently tracked. */
export function trackedKeyCount(): number {
  return buckets.size
}
