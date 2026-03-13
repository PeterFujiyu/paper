import type { ApiRequest, ApiResponse, RequestMeta } from './logger.js'
import { sendJson } from './logger.js'
import { clearAuthCookie, getAuthToken, verifyToken, type UserPayload } from './auth.js'

export function requireAuth(req: ApiRequest, res: ApiResponse, meta: RequestMeta): UserPayload | null {
  const token = getAuthToken(req.headers)
  if (!token) {
    sendJson(res, 401, { error: 'Unauthorized' }, meta)
    return null
  }

  try {
    const user = verifyToken(token)
    meta.userId = user.id
    return user
  } catch {
    clearAuthCookie(res)
    sendJson(res, 401, { error: 'Invalid or expired token' }, meta)
    return null
  }
}
