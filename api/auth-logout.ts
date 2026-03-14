import { connectDB } from '../server/lib/db.js'
import { clearAuthCookie, getAuthToken, verifyToken } from '../server/lib/auth.js'
import { beginRequest, finishRequest, logError, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import User from '../server/models/User.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    // Invalidate all active sessions for this user by incrementing the stored
    // token version.  Any JWT carrying the old tkv value will fail the
    // requireAuth check from this point on, even if it has not expired yet.
    //
    // Guards:
    // 1. Only act when decoded.tkv is an explicit number.  Falling back to 0
    //    via ?? would let a legacy token (no tkv claim) match a document at
    //    tokenVersion: 0 and bump valid sessions out.
    // 2. When decoded.tkv === 0, extend the filter to also match legacy
    //    documents where the tokenVersion field doesn't exist yet (consistent
    //    with the ?? 0 treatment in requireAuth).  This ensures logout
    //    actually revokes those sessions instead of silently no-op'ing.
    // 3. The compound filter makes the version check and the increment atomic
    //    so an already-invalidated token can't affect a newer valid session.
    const token = getAuthToken(req.headers)
    if (token) {
      try {
        const decoded = verifyToken(token)
        meta.userId = decoded.id
        if (typeof decoded.tkv === 'number') {
          const filter =
            decoded.tkv === 0
              ? { _id: decoded.id, $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
              : { _id: decoded.id, tokenVersion: decoded.tkv }
          await connectDB()
          await User.findOneAndUpdate(filter, { $inc: { tokenVersion: 1 } })
        }
      } catch {
        // Ignore errors — an invalid or already-expired token doesn't prevent
        // the cookie from being cleared.
      }
    }

    clearAuthCookie(res)
    sendJson(res, 200, { ok: true }, meta)
  } catch (error) {
    logError('[api/auth-logout]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
