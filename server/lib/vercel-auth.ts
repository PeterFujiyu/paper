import type { ApiRequest, ApiResponse, RequestMeta } from './logger.js'
import { sendJson } from './logger.js'
import { getBearerToken, verifyToken, type UserPayload } from './auth.js'

export function requireAuth(req: ApiRequest, res: ApiResponse, meta: RequestMeta): UserPayload | null {
  const token = getBearerToken(req.headers.authorization)
  if (!token) {
    sendJson(res, 401, { error: 'Unauthorized' }, meta)
    return null
  }

  try {
    const user = verifyToken(token)
    meta.userId = user.id
    return user
  } catch {
    sendJson(res, 401, { error: 'Invalid or expired token' }, meta)
    return null
  }
}
