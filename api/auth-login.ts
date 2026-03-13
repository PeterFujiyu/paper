import { connectDB } from '../server/lib/db.js'
import { setAuthCookie, signToken } from '../server/lib/auth.js'
import { beginRequest, finishRequest, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { validateLoginBody, type AuthBody } from '../server/lib/validation.js'
import User from '../server/models/User.js'

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
    return `Too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`
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
    const validationError = validateLoginBody(body)
    if (validationError) {
      sendJson(res, 400, { error: validationError }, meta)
      return
    }

    const email = body.email!.trim().toLowerCase()
    const password = body.password!
    const user = await User.findOne({ email }).select('+password')

    if (!user || !(await user.comparePassword(password))) {
      recordFailure(meta.requestIp)
      sendJson(res, 401, { error: 'Invalid credentials' }, meta)
      return
    }

    clearFailures(meta.requestIp)
    meta.userId = String(user._id)
    const token = signToken({ id: String(user._id), email: user.email, name: user.name })
    setAuthCookie(res, token)

    sendJson(res, 200, {
      user: { id: String(user._id), email: user.email, name: user.name },
    }, meta)
  } catch (error) {
    logError('[api/auth-login]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
