import { connectDB } from '../server/lib/db.js'
import { beginRequest, finishRequest, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { requireAuth } from '../server/lib/vercel-auth.js'
import { validatePostBody, type PostBody, normalizeSlug } from '../server/lib/validation.js'
import Post from '../server/models/Post.js'

async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const query: Record<string, unknown> = { slug }
  if (excludeId) query._id = { $ne: excludeId }
  const existing = await Post.findOne(query).select('_id').lean()
  return !!existing
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    await connectDB()

    if (req.method === 'GET') {
      const posts = await Post.find({ published: true })
        .sort({ createdAt: -1 })
        .select('slug title excerpt createdAt')
        .lean()
      sendJson(res, 200, posts, meta)
      return
    }

    if (req.method === 'POST') {
      const user = requireAuth(req, res, meta)
      if (!user) return

      const body = readBody<PostBody>(req)
      const validationError = validatePostBody(body)
      if (validationError) {
        sendJson(res, 400, { error: validationError }, meta)
        return
      }

      const slug = normalizeSlug(body.slug ?? '')
      if (await slugExists(slug)) {
        sendJson(res, 409, { error: 'Slug is already in use.' }, meta)
        return
      }

      const post = await Post.create({
        ...body,
        title: body.title!.trim(),
        slug,
        excerpt: body.excerpt!.trim(),
        author: user.id,
      })

      sendJson(res, 201, post, meta)
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' }, meta)
  } catch (error) {
    logError('[api/posts]', meta, error)
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
