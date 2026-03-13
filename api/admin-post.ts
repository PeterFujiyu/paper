import { connectDB } from '../server/lib/db.js'
import { beginRequest, finishRequest, getQueryParam, logError, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { requireAuth } from '../server/lib/vercel-auth.js'
import { sanitizePostContent } from '../server/lib/validation.js'
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

    const id = getQueryParam(req, 'id')
    if (!id) {
      sendJson(res, 400, { error: 'id is required.' }, meta)
      return
    }

    await connectDB()
    const post = await Post.findById(id).lean()
    if (!post) {
      sendJson(res, 404, { error: 'Not found' }, meta)
      return
    }

    const contentResult = sanitizePostContent(post.content)
    if (!contentResult.ok) {
      sendJson(res, 200, { ...post, content: null }, meta)
      return
    }

    sendJson(res, 200, { ...post, content: contentResult.value }, meta)
  } catch (error) {
    logError('[api/admin-post]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
