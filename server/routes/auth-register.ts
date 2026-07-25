import { connectDB } from '../lib/db.js'
import { setAuthCookie, signToken } from '../lib/auth.js'
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from '../lib/auth-throttle.js'
import { beginRequest, finishRequest, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { validateRegisterBody, type AuthBody } from '../lib/validation.js'
import User from '../models/User.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    await connectDB()

    const lockMessage = await checkAuthThrottle('register', meta.requestIp)
    if (lockMessage) {
      sendJson(res, 429, { error: lockMessage }, meta)
      return
    }

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
      await recordAuthFailure('register', meta.requestIp)
      sendJson(res, 403, { error: 'Registration failed.' }, meta)
      return
    }

    const exists = await User.findOne({ email }).lean()
    if (exists) {
      await recordAuthFailure('register', meta.requestIp)
      sendJson(res, 403, { error: 'Registration failed.' }, meta)
      return
    }

    const user = await User.create({ email, password, name })
    await clearAuthFailures('register', meta.requestIp)
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
