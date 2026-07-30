import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockFindOne = vi.hoisted(() => vi.fn())

vi.mock('../../server/lib/db.js', () => ({
  connectDB: mockConnectDB,
}))

vi.mock('../../server/models/Post.js', () => ({
  default: {
    findOne: mockFindOne,
  },
}))

import handler from '../../server/routes/post-shell.js'
import { PUBLIC_READ_CACHE_CONTROL } from '../../server/lib/cache.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

type Res = ApiResponse & { statusCode?: number; html: string; headers: Record<string, string> }

function makeRes(): Res {
  const res: Res = {
    statusCode: undefined,
    html: '',
    headers: {},
    status(code: number) {
      res.statusCode = code
      return res
    },
    json: vi.fn(),
    send(body: string) {
      res.html = body
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value
    },
  }
  return res
}

function makeReq(slug: string, options: { method?: string; host?: string } = {}): ApiRequest {
  return {
    method: options.method ?? 'GET',
    url: `/api/shell?route=post-shell&slug=${slug}`,
    headers: { host: options.host ?? 'paper.example.com' },
    query: { route: 'post-shell', slug },
  }
}

function stubPost(post: unknown): void {
  const lean = vi.fn().mockResolvedValue(post)
  const select = vi.fn().mockReturnValue({ lean })
  mockFindOne.mockReturnValue({ select })
}

/** The content attribute of a meta tag, by property or name. */
function metaContent(html: string, key: string): string | null {
  const match = html.match(
    new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`)
  )
  return match ? match[1] : null
}

const post = {
  slug: 'on-craft',
  title: 'On Craft',
  excerpt: 'An essay about the overlooked details.',
  coverImage: '',
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
}

describe('api/post-shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SITE_ORIGIN
  })

  afterEach(() => {
    delete process.env.SITE_ORIGIN
  })

  it('describes the requested essay, not the site as a whole', async () => {
    stubPost(post)
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(mockFindOne).toHaveBeenCalledWith({ slug: 'on-craft', published: true })
    expect(res.statusCode).toBe(200)
    expect(res.html).toContain('<title>On Craft — Paper</title>')
    expect(metaContent(res.html, 'og:description')).toBe('An essay about the overlooked details.')
    expect(metaContent(res.html, 'og:type')).toBe('article')
    expect(metaContent(res.html, 'article:published_time')).toBe('2026-06-01T00:00:00.000Z')
  })

  // The tab wants the site name; a preview card renders og:site_name beside the
  // title already, so repeating it there just eats width.
  it('names the site in the document title but not in og:title', async () => {
    stubPost(post)
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(metaContent(res.html, 'og:title')).toBe('On Craft')
    expect(metaContent(res.html, 'twitter:title')).toBe('On Craft')
    expect(metaContent(res.html, 'og:site_name')).toBe('Paper')
  })

  it('truncates a long excerpt on a word boundary', async () => {
    const excerpt = `${'word '.repeat(80)}end.`
    stubPost({ ...post, excerpt })
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    const description = metaContent(res.html, 'og:description')!
    expect(description.length).toBeLessThanOrEqual(201)
    expect(description.endsWith('…')).toBe(true)
    // Cut between words, never mid-word.
    expect(description).not.toMatch(/wor…$/)
  })

  it('leaves a short excerpt untouched', async () => {
    stubPost(post)
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(metaContent(res.html, 'og:description')).not.toContain('…')
  })

  it('serves HTML the CDN can hold', async () => {
    stubPost(post)
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8')
    expect(res.headers['Cache-Control']).toBe(PUBLIC_READ_CACHE_CONTROL)
  })

  it('normalizes the slug before looking it up', async () => {
    stubPost(post)

    await handler(makeReq('On-Craft'), makeRes())

    expect(mockFindOne).toHaveBeenCalledWith({ slug: 'on-craft', published: true })
  })

  it('points the canonical URL and og:url at the real essay', async () => {
    stubPost(post)
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(res.html).toContain('<link rel="canonical" href="https://paper.example.com/writing/on-craft" />')
    expect(metaContent(res.html, 'og:url')).toBe('https://paper.example.com/writing/on-craft')
  })

  it('prefers SITE_ORIGIN over the request host', async () => {
    process.env.SITE_ORIGIN = 'https://paper.test/'
    stubPost(post)
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(metaContent(res.html, 'og:url')).toBe('https://paper.test/writing/on-craft')
  })

  it('omits the absolute URLs rather than echoing a junk Host header', async () => {
    stubPost(post)
    const res = makeRes()

    await handler(makeReq('on-craft', { host: 'evil host/../x' }), res)

    expect(res.html).not.toContain('rel="canonical"')
    expect(metaContent(res.html, 'og:url')).toBeNull()
    // No origin means no absolute image either — better absent than wrong.
    expect(metaContent(res.html, 'og:image')).toBeNull()
  })

  it('makes a relative cover image absolute and asks for the large card', async () => {
    stubPost({ ...post, coverImage: '/covers/craft.jpg' })
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(metaContent(res.html, 'og:image')).toBe('https://paper.example.com/covers/craft.jpg')
    expect(metaContent(res.html, 'twitter:card')).toBe('summary_large_image')
  })

  it('keeps a remote cover image as given', async () => {
    stubPost({ ...post, coverImage: 'https://cdn.example.com/craft.jpg' })
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(metaContent(res.html, 'og:image')).toBe('https://cdn.example.com/craft.jpg')
  })

  it('falls back to the site icon and the small card without a cover', async () => {
    stubPost(post)
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(metaContent(res.html, 'og:image')).toBe('https://paper.example.com/icon-light.png')
    expect(metaContent(res.html, 'twitter:card')).toBe('summary')
  })

  it('escapes markup and quotes out of the post fields', async () => {
    stubPost({
      ...post,
      title: 'Quotes "and" <script>alert(1)</script>',
      excerpt: "Ampersands & angle < brackets > and 'quotes'",
    })
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(res.html).not.toContain('<script>')
    expect(res.html).toContain('&lt;script&gt;')
    expect(res.html).toContain('&quot;and&quot;')
    expect(res.html).toContain('angle &lt; brackets &gt;')
    expect(res.html).toContain('&#39;quotes&#39;')
    // The attribute must not be broken open by the quotes in the title.
    expect(metaContent(res.html, 'og:title')).toContain('&quot;and&quot;')
  })

  it('answers an unknown slug with a valid 404 document, not a crash', async () => {
    stubPost(null)
    const res = makeRes()

    await handler(makeReq('nope'), res)

    expect(res.statusCode).toBe(404)
    expect(res.html).toContain('<!doctype html>')
    expect(res.html).toContain('<title>Not found — Paper</title>')
    // Nothing canonical to point at, and nothing cacheable to promise.
    expect(res.html).not.toContain('rel="canonical"')
    expect(res.headers['Cache-Control']).toBeUndefined()
  })

  it('answers a missing slug with the site-level document', async () => {
    const res = makeRes()

    await handler({ method: 'GET', url: '/api/post-shell', headers: { host: 'paper.example.com' }, query: {} }, res)

    expect(res.statusCode).toBe(400)
    expect(res.html).toContain('<title>Paper</title>')
    expect(mockFindOne).not.toHaveBeenCalled()
  })

  it('refuses anything but GET', async () => {
    const res = makeRes()

    await handler(makeReq('on-craft', { method: 'POST' }), res)

    expect(res.statusCode).toBe(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
    expect(mockConnectDB).not.toHaveBeenCalled()
  })

  it('reports a failure without leaking the database error', async () => {
    mockFindOne.mockImplementation(() => {
      throw new Error('connection string leaked here')
    })
    const res = makeRes()

    await handler(makeReq('on-craft'), res)

    expect(res.statusCode).toBe(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Request failed' })
  })
})
