import { connectDB } from '../lib/db.js'
import { setPublicReadCache } from '../lib/cache.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { extractPlainText } from '../lib/content-text.js'
import { withPostMetrics } from '../lib/post-metrics.js'
import { requireAuth } from '../lib/vercel-auth.js'
import { normalizeSlug, normalizeCoverImage, normalizeReadingOverride, normalizeTags, resolveReadingMinutes, sanitizePostContent, validatePostBody, type PostBody } from '../lib/validation.js'
import Post from '../models/Post.js'

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

      const contentResult = sanitizePostContent(post.content)
      setPublicReadCache(res)
      const postWithMetrics = withPostMetrics(post)
      if (!contentResult.ok) {
        sendJson(res, 200, { ...postWithMetrics, content: null }, meta)
        return
      }

      sendJson(res, 200, { ...postWithMetrics, content: contentResult.value }, meta)
      return
    }

    const user = await requireAuth(req, res, meta)
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

      const contentResult = sanitizePostContent(body.content)
      if (!contentResult.ok) {
        sendJson(res, 400, { error: contentResult.error }, meta)
        return
      }

      const slug = normalizeSlug(body.slug ?? '')
      if (await slugExists(slug, id)) {
        sendJson(res, 409, { error: 'Slug is already in use.' }, meta)
        return
      }

      // Set fields explicitly rather than spreading `body`, so a caller can't
      // reassign server-owned fields (author, viewCount, readCompletionCount)
      // through the update.
      const contentText = extractPlainText(contentResult.value)
      const post = await Post.findByIdAndUpdate(
        id,
        {
          $set: {
            title: body.title!.trim(),
            slug,
            excerpt: body.excerpt!.trim(),
            coverImage: normalizeCoverImage(body.coverImage),
            tags: normalizeTags(body.tags),
            content: contentResult.value,
            contentText,
            readingMinutes: resolveReadingMinutes(body.readingMinutesOverride, contentText),
            readingMinutesOverride: normalizeReadingOverride(body.readingMinutesOverride),
            published: body.published === true,
          },
        },
        { new: true, runValidators: true }
      ).lean()

      if (!post) {
        sendJson(res, 404, { error: 'Not found' }, meta)
        return
      }

      sendJson(res, 200, withPostMetrics(post), meta)
      return
    }

    if (req.method === 'DELETE') {
      await Post.findByIdAndDelete(id)
      sendJson(res, 200, { ok: true }, meta)
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' }, meta)
  } catch (error) {
    if (isDuplicateSlugError(error)) {
      sendJson(res, 409, { error: 'Slug is already in use.' }, meta)
      return
    }
    logError('[api/post]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
