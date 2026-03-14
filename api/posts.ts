import { connectDB } from '../server/lib/db.js'
import { beginRequest, finishRequest, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { requireAuth } from '../server/lib/vercel-auth.js'
import { validatePostBody, type PostBody, normalizeSlug, sanitizePostContent } from '../server/lib/validation.js'
import Post from '../server/models/Post.js'

function isDuplicateSlugError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: number }).code === 11000 &&
    'keyPattern' in error &&
    (error as { keyPattern?: Record<string, unknown> }).keyPattern?.slug
  )
}

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
      const user = await requireAuth(req, res, meta)
      if (!user) return

      const body = readBody<PostBody>(req)
      const validationError = validatePostBody(body)
      if (validationError) {
        sendJson(res, 400, { error: validationError }, meta)
        return
      }

      const contentResult = sanitizePostContent(body.content)
      if (!contentResult.ok) {
        sendJson(res, 400, { error: contentResult.error }, meta)
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
          content: contentResult.value,
          author: user.id,
        })

      sendJson(res, 201, post, meta)
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' }, meta)
  } catch (error) {
    if (isDuplicateSlugError(error)) {
      sendJson(res, 409, { error: 'Slug is already in use.' }, meta)
      return
    }
    logError('[api/posts]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
