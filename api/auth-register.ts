import { connectDB } from '../server/lib/db.js'
import { setAuthCookie, signToken } from '../server/lib/auth.js'
import { beginRequest, finishRequest, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { validateRegisterBody, type AuthBody } from '../server/lib/validation.js'
import User from '../server/models/User.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
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

    if (inviteCode !== expected) {
      sendJson(res, 403, { error: 'Invalid invite code.' }, meta)
      return
    }

    const exists = await User.findOne({ email }).lean()
    if (exists) {
      sendJson(res, 409, { error: 'Email already registered' }, meta)
      return
    }

    const user = await User.create({ email, password, name })
    meta.userId = String(user._id)
    const token = signToken({ id: String(user._id), email: user.email, name: user.name })
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
