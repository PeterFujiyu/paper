import { connectDB } from '../server/lib/db.js'
import { getHCaptchaToken, verifyHCaptcha } from '../server/lib/hcaptcha.js'
import { beginRequest, finishRequest, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { trackMetricRequest } from '../server/lib/metric-throttle.js'
import { withPostMetrics } from '../server/lib/post-metrics.js'
import { normalizeSlug } from '../server/lib/validation.js'
import Post from '../server/models/Post.js'

type PostViewBody = {
  slug?: unknown
  hcaptchaToken?: unknown
  hCaptchaToken?: unknown
  'h-captcha-response'?: unknown
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    const body = readBody<PostViewBody>(req)
    const slug = typeof body.slug === 'string' ? normalizeSlug(body.slug) : ''
    if (!slug) {
      sendJson(res, 400, { error: 'Slug is required.' }, meta)
      return
    }

    await connectDB()

    const token = getHCaptchaToken(body)
    const shouldRequireCaptcha = await trackMetricRequest(req, 'post-view', slug)
    if (shouldRequireCaptcha || token) {
      const captcha = await verifyHCaptcha(req, token)
      if (!captcha.ok) {
        sendJson(res, captcha.status, {
          error: captcha.error,
          requiresHCaptcha: true,
        }, meta)
        return
      }
    }

    const post = await Post.findOneAndUpdate(
      { slug, published: true },
      { $inc: { viewCount: 1 } },
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
    logError('[api/post-view]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
