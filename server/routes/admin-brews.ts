import { connectDB } from '../lib/db.js'
import { beginRequest, finishRequest, logError, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import Brew from '../models/Brew.js'
import { requireAuth } from '../lib/vercel-auth.js'

// Full brew list for the admin management view. Auth-gated; returns the fields
// the list rows show. `searchText` stays server-side.
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    const user = await requireAuth(req, res, meta)
    if (!user) return

    await connectDB()
    const brews = await Brew.find()
      .sort({ createdAt: -1 })
      .select('bean origin method rating createdAt')
      .lean()

    res.setHeader('Cache-Control', 'no-store')
    sendJson(res, 200, brews, meta)
  } catch (error) {
    logError('[api/admin-brews]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
