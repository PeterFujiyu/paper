import AuthThrottle from '../models/AuthThrottle.js'

export type AuthThrottleAction = 'login' | 'register' | 'password'

const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000
// Keep a throttle row alive past its lock so repeated bursts stay counted; the
// TTL index reaps it once this elapses with no further failures.
const RECORD_TTL_MS = LOCK_MS * 2

function keyFor(action: AuthThrottleAction, ip: string): string {
  return `${action}:${ip}`
}

/**
 * Return a human-readable lockout message when this IP is currently locked for
 * the given action, otherwise null. Once a lock has elapsed the row is dropped
 * so the counter restarts from zero on the next failure — the same reset the
 * old in-memory implementation performed, but durable across instances.
 *
 * connectDB must be called before this.
 */
export async function checkAuthThrottle(
  action: AuthThrottleAction,
  ip: string
): Promise<string | null> {
  const key = keyFor(action, ip)
  const entry = await AuthThrottle.findOne({ key }).select('lockedUntil').lean()
  if (!entry) return null

  const lockedUntil = entry.lockedUntil ? entry.lockedUntil.getTime() : 0
  const now = Date.now()

  if (lockedUntil && now < lockedUntil) {
    const remaining = Math.ceil((lockedUntil - now) / 1000 / 60)
    return `Too many attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`
  }

  if (lockedUntil && now >= lockedUntil) {
    await AuthThrottle.deleteOne({ key })
  }

  return null
}

/**
 * Record one failed attempt. Atomically increments the counter (creating the row
 * on first failure) and, once the threshold is reached, stamps a lock window.
 *
 * connectDB must be called before this.
 */
export async function recordAuthFailure(action: AuthThrottleAction, ip: string): Promise<void> {
  const key = keyFor(action, ip)
  const now = Date.now()

  const record = await AuthThrottle.findOneAndUpdate(
    { key },
    {
      $inc: { count: 1 },
      $set: { expiresAt: new Date(now + RECORD_TTL_MS) },
      $setOnInsert: { key, action, ip },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()

  const count = record?.count ?? 0
  const alreadyLocked = Boolean(record?.lockedUntil && record.lockedUntil.getTime() > now)

  if (count >= MAX_FAILS && !alreadyLocked) {
    await AuthThrottle.updateOne({ key }, { $set: { lockedUntil: new Date(now + LOCK_MS) } })
  }
}

/**
 * Clear the failure counter for this IP/action after a successful attempt.
 *
 * connectDB must be called before this.
 */
export async function clearAuthFailures(action: AuthThrottleAction, ip: string): Promise<void> {
  await AuthThrottle.deleteOne({ key: keyFor(action, ip) })
}
