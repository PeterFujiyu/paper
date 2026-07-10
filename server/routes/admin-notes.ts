import { connectDB } from '../lib/db.js'
import { beginRequest, finishRequest, logError, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { requireAuth } from '../lib/vercel-auth.js'
import Note from '../models/Note.js'

// Full note list for the admin management view. Auth-gated; returns the content
// so the list can show a preview. `contentText` stays server-side.
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
    const notes = await Note.find()
      .sort({ createdAt: -1 })
      .select('content createdAt')
      .lean()

    res.setHeader('Cache-Control', 'no-store')
    sendJson(res, 200, notes, meta)
  } catch (error) {
    logError('[api/admin-notes]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
