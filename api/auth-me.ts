import { beginRequest, finishRequest, logError, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { requireAuth } from '../server/lib/vercel-auth.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    const user = await requireAuth(req, res, meta)
    if (!user) return
    sendJson(res, 200, { id: user.id, email: user.email, name: user.name }, meta)
  } catch (error) {
    logError('[api/auth-me]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
