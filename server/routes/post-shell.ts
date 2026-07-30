import { setPublicReadCache } from '../lib/cache.js'
import { connectDB } from '../lib/db.js'
import { beginRequest, finishRequest, getQueryParam, logError, sendHtml, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { normalizeSlug } from '../lib/validation.js'
import Post from '../models/Post.js'

/**
 * Per-essay link previews.
 *
 * index.html carries one static set of Open Graph tags, so every shared essay
 * previewed identically — same title, same description, whichever post it was.
 * The tags have to differ per URL, and in a client-rendered SPA nothing in the
 * served HTML knows which post it is.
 *
 * This route answers /writing/:slug with a small document whose head describes
 * that one post. vercel.json routes only link-preview crawlers here (see the
 * `has` condition on the rewrite): they do not run JavaScript, which is exactly
 * why they need this. Search engines are deliberately NOT routed here — they
 * render the SPA and should index the real page, and serving them a different
 * document than humans get is the thing to avoid.
 *
 * The body is minimal but real: title, excerpt, and a link to the canonical URL,
 * so anything that follows the link lands somewhere sensible.
 */

const SITE_NAME = 'Paper'
const DEFAULT_IMAGE = '/icon-light.png'
const hostPattern = /^[a-z0-9.-]+(?::\d+)?$/i

const META_FIELDS = 'slug title excerpt coverImage createdAt'

/**
 * Preview cards cut the description off around here anyway; truncating on a word
 * boundary ourselves beats letting a platform slice mid-word.
 */
const MAX_DESCRIPTION = 200

function truncate(text: string, limit = MAX_DESCRIPTION): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= limit) return clean

  const cut = clean.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\-—]$/, '')}…`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The site's own origin, for canonical and absolute image URLs. SITE_ORIGIN wins
 * when set; otherwise the request's Host, which must look like a hostname before
 * it is trusted enough to echo into a tag. Empty when neither is usable — the
 * tags that need an absolute URL are then simply omitted rather than guessed.
 */
function resolveOrigin(req: ApiRequest): string {
  const configured = process.env.SITE_ORIGIN?.trim().replace(/\/+$/, '')
  if (configured) return configured

  const header = req.headers.host
  const host = (Array.isArray(header) ? header[0] : header)?.trim() ?? ''
  if (!host || !hostPattern.test(host)) return ''

  const scheme = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  return `${scheme}://${host}`
}

function absoluteUrl(origin: string, path: string): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path
  if (!origin) return ''
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`
}

type ShellMeta = {
  /** The bare post title: og:title, since og:site_name already names the site. */
  title: string
  description: string
  canonical: string
  image: string
  largeImage: boolean
  publishedAt: string
}

function renderShell(meta: ShellMeta): string {
  const description = truncate(meta.description)
  // The tab and history entry want the site name; a preview card does not, since
  // it renders og:site_name beside the title already.
  const documentTitle = meta.title === SITE_NAME ? SITE_NAME : `${meta.title} — ${SITE_NAME}`

  const tags = [
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(documentTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    '<meta property="og:type" content="article" />',
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:card" content="${meta.largeImage ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  ]

  if (meta.canonical) {
    tags.push(`<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`)
    tags.push(`<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`)
  }
  if (meta.image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(meta.image)}" />`)
    tags.push(`<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`)
  }
  if (meta.publishedAt) {
    tags.push(`<meta property="article:published_time" content="${escapeHtml(meta.publishedAt)}" />`)
  }

  const link = meta.canonical
    ? `<p><a href="${escapeHtml(meta.canonical)}">Read on ${escapeHtml(SITE_NAME)}</a></p>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
${tags.map((tag) => `  ${tag}`).join('\n')}
</head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  <p>${escapeHtml(meta.description.trim())}</p>
  ${link}
</body>
</html>
`
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    const slug = normalizeSlug(getQueryParam(req, 'slug'))
    const origin = resolveOrigin(req)

    if (!slug) {
      sendHtml(res, 400, renderShell({
        title: SITE_NAME,
        description: 'Paper — a personal blog.',
        canonical: origin,
        image: absoluteUrl(origin, DEFAULT_IMAGE),
        largeImage: false,
        publishedAt: '',
      }), meta)
      return
    }

    await connectDB()
    const post = await Post.findOne({ slug, published: true }).select(META_FIELDS).lean()

    if (!post) {
      // A crawler still needs a valid document, just not an indexable claim
      // about a post that isn't there.
      sendHtml(res, 404, renderShell({
        title: 'Not found',
        description: "This essay doesn't exist.",
        canonical: '',
        image: absoluteUrl(origin, DEFAULT_IMAGE),
        largeImage: false,
        publishedAt: '',
      }), meta)
      return
    }

    const cover = absoluteUrl(origin, post.coverImage ?? '')
    const createdAt = post.createdAt instanceof Date
      ? post.createdAt.toISOString()
      : String(post.createdAt ?? '')

    setPublicReadCache(res)
    sendHtml(res, 200, renderShell({
      title: post.title,
      description: post.excerpt ?? '',
      canonical: origin ? `${origin}/writing/${encodeURIComponent(post.slug)}` : '',
      image: cover || absoluteUrl(origin, DEFAULT_IMAGE),
      largeImage: Boolean(cover),
      publishedAt: createdAt,
    }), meta)
  } catch (error) {
    logError('[api/post-shell]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
