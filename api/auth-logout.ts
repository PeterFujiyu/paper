import { clearAuthCookie } from '../server/lib/auth.js'
import { beginRequest, finishRequest, logError, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
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
