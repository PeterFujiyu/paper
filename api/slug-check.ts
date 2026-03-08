import { connectDB } from '../server/lib/db.js'
import { beginRequest, finishRequest, getQueryParam, logError, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { requireAuth } from '../server/lib/vercel-auth.js'
import { normalizeSlug } from '../server/lib/validation.js'
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

    const slug = normalizeSlug(getQueryParam(req, 'slug'))
    const excludeId = getQueryParam(req, 'excludeId') || undefined

    if (!slug) {
      sendJson(res, 400, { error: 'Slug is required.' }, meta)
      return
    }

    await connectDB()
    const query: Record<string, unknown> = { slug }
    if (excludeId) query._id = { $ne: excludeId }
    const existing = await Post.findOne(query).select('_id').lean()
    sendJson(res, 200, { available: !existing }, meta)
  } catch (error) {
    logError('[api/slug-check]', meta, error)
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
