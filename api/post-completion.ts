import { connectDB } from '../server/lib/db.js'
import { beginRequest, finishRequest, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { withPostMetrics } from '../server/lib/post-metrics.js'
import { normalizeSlug } from '../server/lib/validation.js'
import Post from '../server/models/Post.js'

type CompletionBody = {
  slug?: unknown
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    const body = readBody<CompletionBody>(req)
    const slug = typeof body.slug === 'string' ? normalizeSlug(body.slug) : ''
    if (!slug) {
      sendJson(res, 400, { error: 'Slug is required.' }, meta)
      return
    }

    await connectDB()
    const post = await Post.findOneAndUpdate(
      { slug, published: true },
      { $inc: { readCompletionCount: 1 } },
      { new: true }
    )
      .select('viewCount readCompletionCount')
      .lean()

    if (!post) {
      sendJson(res, 404, { error: 'Not found' }, meta)
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    sendJson(res, 200, withPostMetrics(post), meta)
  } catch (error) {
    logError('[api/post-completion]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
