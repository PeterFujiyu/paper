import AuthThrottle from '../models/AuthThrottle.js'

// Shared brute-force protection for the auth endpoints. Unlike a per-instance
// Map, this state lives in MongoDB, so the lockout is enforced consistently
// across every serverless instance and survives cold starts. The client IP is
// taken from the leftmost X-Forwarded-For entry, which the Vercel edge sets to
// the true client address (a client-supplied value is appended after it and
// therefore ignored) — see the note in logger.ts.

export type AuthAction = 'login' | 'register'

const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000

function keyFor(action: AuthAction, ip: string): string {
  return `${action}:${ip}`
}

// Returns a human-readable message when the caller is currently locked out,
// otherwise null. A lock whose window has elapsed is cleared so the next attempt
// starts from a clean slate (matching the previous in-memory semantics).
export async function checkAuthLock(action: AuthAction, ip: string): Promise<string | null> {
  const key = keyFor(action, ip)

  let record: { lockedUntil?: Date | null } | null
  try {
    record = await AuthThrottle.findOne({ key }).select('lockedUntil').lean()
  } catch {
    // Fail open on a lookup error so a database hiccup can't lock everyone out;
    // the primary auth query in the handler would fail too if the DB is down.
    return null
  }

  const lockedUntil = record?.lockedUntil ? record.lockedUntil.getTime() : 0
  if (!lockedUntil) return null

  const now = Date.now()
  if (now < lockedUntil) {
    const remaining = Math.ceil((lockedUntil - now) / 1000 / 60)
    return `Too many attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`
  }

  await AuthThrottle.deleteOne({ key }).catch(() => {})
  return null
}

// Records one failed attempt and arms the lockout once the threshold is reached.
// Best-effort: throttling must never convert a legitimate 401 into a 500.
export async function recordAuthFailure(action: AuthAction, ip: string): Promise<void> {
  const key = keyFor(action, ip)
  const now = Date.now()

  try {
    const record = await AuthThrottle.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $set: { expiresAt: new Date(now + LOCK_MS) },
        $setOnInsert: { key, action },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .select('count lockedUntil')
      .lean()

    const count = record?.count ?? 0
    const alreadyLocked = record?.lockedUntil ? record.lockedUntil.getTime() > now : false
    if (count >= MAX_FAILS && !alreadyLocked) {
      await AuthThrottle.updateOne(
        { key },
        { $set: { lockedUntil: new Date(now + LOCK_MS), expiresAt: new Date(now + LOCK_MS) } }
      )
    }
  } catch {
    // Ignore — see note above.
  }
}

// Clears the failure counter after a successful auth. Best-effort.
export async function clearAuthFailures(action: AuthAction, ip: string): Promise<void> {
  await AuthThrottle.deleteOne({ key: keyFor(action, ip) }).catch(() => {})
}
