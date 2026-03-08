import { connectDB } from '../server/lib/db.js'
import { beginRequest, finishRequest, logError, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { requireAuth } from '../server/lib/vercel-auth.js'
import Post from '../server/models/Post.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    const user = requireAuth(req, res, meta)
    if (!user) return

    await connectDB()
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .select('slug title published createdAt')
      .lean()

    sendJson(res, 200, posts, meta)
  } catch (error) {
    logError('[api/admin-posts]', meta, error)
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
