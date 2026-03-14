import { connectDB } from '../server/lib/db.js'
import { setAuthCookie, signToken } from '../server/lib/auth.js'
import { beginRequest, finishRequest, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { validateRegisterBody, type AuthBody } from '../server/lib/validation.js'
import User from '../server/models/User.js'

// ---------------------------------------------------------------------------
// In-memory rate limit — same pattern as auth-login.ts.
// Keyed by IP; 5 failures within a window trigger a 15-minute lockout.
// ---------------------------------------------------------------------------

type FailEntry = {
  count: number
  lockedUntil: number | null
}

const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000
const failMap = new Map<string, FailEntry>()

function checkRateLimit(ip: string): string | null {
  const now = Date.now()
  const entry = failMap.get(ip)
  if (!entry) return null
  if (entry.lockedUntil && now < entry.lockedUntil) {
    const remaining = Math.ceil((entry.lockedUntil - now) / 1000 / 60)
    return `Too many attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`
  }
  if (entry.lockedUntil && now >= entry.lockedUntil) failMap.delete(ip)
  return null
}

function recordFailure(ip: string): void {
  const entry = failMap.get(ip) ?? { count: 0, lockedUntil: null }
  entry.count += 1
  if (entry.count >= MAX_FAILS) entry.lockedUntil = Date.now() + LOCK_MS
  failMap.set(ip, entry)
}

function clearFailures(ip: string): void {
  failMap.delete(ip)
}

// ---------------------------------------------------------------------------

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    const lockMessage = checkRateLimit(meta.requestIp)
    if (lockMessage) {
      sendJson(res, 429, { error: lockMessage }, meta)
      return
    }

    await connectDB()
    const body = readBody<AuthBody>(req)
    const validationError = validateRegisterBody(body)
    if (validationError) {
      sendJson(res, 400, { error: validationError }, meta)
      return
    }

    const expected = process.env.INVITE_CODE
    if (!expected) {
      sendJson(res, 403, { error: 'Registration is disabled.' }, meta)
      return
    }

    const email = body.email!.trim().toLowerCase()
    const password = body.password!
    const name = body.name!.trim()
    const inviteCode = body.inviteCode!.trim()

    // Return the same generic error for both a wrong invite code and an
    // already-registered e-mail so that neither invite codes nor existing
    // accounts can be enumerated through differing responses.
    if (inviteCode !== expected) {
      recordFailure(meta.requestIp)
      sendJson(res, 403, { error: 'Registration failed.' }, meta)
      return
    }

    const exists = await User.findOne({ email }).lean()
    if (exists) {
      recordFailure(meta.requestIp)
      sendJson(res, 403, { error: 'Registration failed.' }, meta)
      return
    }

    const user = await User.create({ email, password, name })
    clearFailures(meta.requestIp)
    meta.userId = String(user._id)
    const token = signToken({
      id: String(user._id),
      email: user.email,
      name: user.name,
      tkv: user.tokenVersion,
    })
    setAuthCookie(res, token)

    sendJson(res, 201, {
      user: { id: String(user._id), email: user.email, name: user.name },
    }, meta)
  } catch (error) {
    logError('[api/auth-register]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
