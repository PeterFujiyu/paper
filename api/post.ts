import { connectDB } from '../server/lib/db.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { requireAuth } from '../server/lib/vercel-auth.js'
import { normalizeSlug, validatePostBody, type PostBody } from '../server/lib/validation.js'
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
      const slug = normalizeSlug(getQueryParam(req, 'slug'))
      if (!slug) {
        sendJson(res, 400, { error: 'Slug is required.' }, meta)
        return
      }

      const post = await Post.findOne({ slug, published: true }).lean()
      if (!post) {
        sendJson(res, 404, { error: 'Not found' }, meta)
        return
      }

      sendJson(res, 200, post, meta)
      return
    }

    const user = requireAuth(req, res, meta)
    if (!user) return

    const id = getQueryParam(req, 'id')
    if (!id) {
      sendJson(res, 400, { error: 'id is required.' }, meta)
      return
    }

    if (req.method === 'PUT') {
      const body = readBody<PostBody>(req)
      const validationError = validatePostBody(body)
      if (validationError) {
        sendJson(res, 400, { error: validationError }, meta)
        return
      }

      const slug = normalizeSlug(body.slug ?? '')
      if (await slugExists(slug, id)) {
        sendJson(res, 409, { error: 'Slug is already in use.' }, meta)
        return
      }

      const post = await Post.findByIdAndUpdate(
        id,
        {
          $set: {
            ...body,
            title: body.title!.trim(),
            slug,
            excerpt: body.excerpt!.trim(),
          },
        },
        { new: true, runValidators: true }
      )

      if (!post) {
        sendJson(res, 404, { error: 'Not found' }, meta)
        return
      }

      sendJson(res, 200, post, meta)
      return
    }

    if (req.method === 'DELETE') {
      await Post.findByIdAndDelete(id)
      sendJson(res, 200, { ok: true }, meta)
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' }, meta)
  } catch (error) {
    logError('[api/post]', meta, error)
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
