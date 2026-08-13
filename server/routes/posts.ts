import { connectDB } from '../lib/db.js'
import { setPublicReadCache } from '../lib/cache.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { extractPlainText } from '../lib/content-text.js'
import { listPublishedPosts, MAX_CONTENT_SEARCH_LENGTH, searchPublishedPosts } from '../lib/content-queries.js'
import { withPostMetrics } from '../lib/post-metrics.js'
import { isDuplicateSlugError, slugExists } from '../lib/post-slugs.js'
import { requireAuth } from '../lib/vercel-auth.js'
import { validatePostBody, type PostBody, normalizeSlug, normalizeCoverImage, normalizeReadingOverride, normalizeTags, resolveReadingMinutes, sanitizePostContent } from '../lib/validation.js'
import Post from '../models/Post.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    await connectDB()

    if (req.method === 'GET') {
      // Cap the query length before it's compiled to a regex — search is a
      // literal substring match, so nothing useful lives past this bound.
      const q = getQueryParam(req, 'q').trim().slice(0, MAX_CONTENT_SEARCH_LENGTH)
      const posts = q
        ? await searchPublishedPosts(q, 20)
        // The HTTP listing is historically unbounded. MCP callers always pass
        // a positive, schema-bounded limit; 0 preserves the public API contract.
        : await listPublishedPosts({ limit: 0 })

      setPublicReadCache(res)
      sendJson(res, 200, posts.map(withPostMetrics), meta)
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

      // Set fields explicitly rather than spreading `body`, so a caller can't
      // slip in server-owned fields (viewCount, readCompletionCount, author,
      // _id, createdAt) alongside the ones we validate.
      const contentText = extractPlainText(contentResult.value)
      const post = await Post.create({
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
        author: user.id,
      })

      sendJson(res, 201, withPostMetrics(post.toObject()), meta)
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
