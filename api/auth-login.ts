import { connectDB } from '../server/lib/db.js'
import { setAuthCookie, signToken } from '../server/lib/auth.js'
import { checkAuthLock, clearAuthFailures, recordAuthFailure } from '../server/lib/auth-throttle.js'
import { beginRequest, finishRequest, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { validateLoginBody, type AuthBody } from '../server/lib/validation.js'
import User from '../server/models/User.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    await connectDB()

    const lockMessage = await checkAuthLock('login', meta.requestIp)
    if (lockMessage) {
      sendJson(res, 429, { error: lockMessage }, meta)
      return
    }

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
      await recordAuthFailure('login', meta.requestIp)
      sendJson(res, 401, { error: 'Invalid credentials' }, meta)
      return
    }

    await clearAuthFailures('login', meta.requestIp)
    meta.userId = String(user._id)
    const token = signToken({
      id: String(user._id),
      email: user.email,
      name: user.name,
      tkv: user.tokenVersion,
    })
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
