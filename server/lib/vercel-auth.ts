import { connectDB } from './db.js'
import type { ApiRequest, ApiResponse, RequestMeta } from './logger.js'
import { sendJson } from './logger.js'
import { clearAuthCookie, getAuthToken, verifyToken, type UserPayload } from './auth.js'
import User from '../models/User.js'

// requireAuth verifies the JWT, then checks that the embedded token-version
// (tkv) still matches the value persisted in the User document.  Incrementing
// User.tokenVersion (e.g. on logout) immediately invalidates all outstanding
// sessions for that user without needing a token blocklist.
export async function requireAuth(
  req: ApiRequest,
  res: ApiResponse,
  meta: RequestMeta,
): Promise<UserPayload | null> {
  const token = getAuthToken(req.headers)
  if (!token) {
    sendJson(res, 401, { error: 'Unauthorized' }, meta)
    return null
  }

  let decoded: UserPayload
  try {
    decoded = verifyToken(token)
    meta.userId = decoded.id
  } catch {
    clearAuthCookie(res)
    sendJson(res, 401, { error: 'Invalid or expired token' }, meta)
    return null
  }

  try {
    await connectDB()
    const user = await User.findById(decoded.id).select('tokenVersion').lean()
    // Treat a missing tokenVersion field (legacy documents that pre-date the
    // column) as 0 so that existing accounts don't need a data migration.
    const storedVersion = user?.tokenVersion ?? 0
    if (!user || storedVersion !== decoded.tkv) {
      clearAuthCookie(res)
      sendJson(res, 401, { error: 'Session is no longer valid' }, meta)
      return null
    }
  } catch {
    sendJson(res, 500, { error: 'Request failed' }, meta)
    return null
  }

  return decoded
}
