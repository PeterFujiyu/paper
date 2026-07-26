import { connectDB } from '../lib/db.js'
import { setAuthCookie, signToken } from '../lib/auth.js'
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from '../lib/auth-throttle.js'
import { beginRequest, finishRequest, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { requireAuth } from '../lib/vercel-auth.js'
import { validatePasswordChangeBody, type PasswordChangeBody } from '../lib/validation.js'
import User from '../models/User.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    const auth = await requireAuth(req, res, meta)
    if (!auth) return

    await connectDB()

    const lockMessage = await checkAuthThrottle('password', meta.requestIp)
    if (lockMessage) {
      sendJson(res, 429, { error: lockMessage }, meta)
      return
    }

    const body = readBody<PasswordChangeBody>(req)
    const validationError = validatePasswordChangeBody(body)
    if (validationError) {
      sendJson(res, 400, { error: validationError }, meta)
      return
    }

    const user = await User.findById(auth.id).select('+password')
    if (!user) {
      sendJson(res, 401, { error: 'Unauthorized' }, meta)
      return
    }

    // 403 rather than 401 for a wrong current password: the session itself is
    // still valid, and the admin client treats every 401 as a signed-out
    // session (clearAuth + redirect to /admin/login). A typo must not log the
    // user out mid-form.
    if (!(await user.comparePassword(body.currentPassword!))) {
      await recordAuthFailure('password', meta.requestIp)
      sendJson(res, 403, { error: 'Current password is incorrect.' }, meta)
      return
    }

    await clearAuthFailures('password', meta.requestIp)

    // Write the hash and bump tokenVersion in one atomic compare-and-swap
    // against the version this session authenticated with. A read/modify/save
    // would let two concurrent changes both go from N to N+1 and both walk
    // away with a valid cookie, leaving a session alive that should have been
    // revoked. Losing the CAS means another change landed first, so this
    // session is already stale.
    //
    // The tkv === 0 branch also matches legacy documents with no tokenVersion
    // field, mirroring the `?? 0` treatment in requireAuth.
    const versionFilter =
      auth.tkv === 0
        ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
        : { tokenVersion: auth.tkv }

    const updated = await User.findOneAndUpdate(
      { _id: auth.id, ...versionFilter },
      {
        $set: { password: await User.hashPassword(body.newPassword!) },
        $inc: { tokenVersion: 1 },
      },
      { new: true, runValidators: true }
    )
      .select('email name tokenVersion')
      .lean()

    if (!updated) {
      sendJson(res, 409, { error: 'Session is no longer current. Sign in again and retry.' }, meta)
      return
    }

    // Re-issue this session's cookie at the new token version so the caller
    // stays signed in while the other sessions are revoked.
    const token = signToken({
      id: auth.id,
      email: updated.email,
      name: updated.name,
      tkv: updated.tokenVersion,
    })
    setAuthCookie(res, token)

    sendJson(res, 200, { ok: true }, meta)
  } catch (error) {
    logError('[api/auth-password]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
