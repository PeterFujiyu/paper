import { beginRequest, finishRequest, logError, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { requireAuth } from '../server/lib/vercel-auth.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    const user = requireAuth(req, res, meta)
    if (!user) return
    sendJson(res, 200, user, meta)
  } catch (error) {
    logError('[api/auth-me]', meta, error)
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
