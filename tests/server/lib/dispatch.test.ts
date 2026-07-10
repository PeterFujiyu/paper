import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createDispatcher, resolveRouteName } from '../../../server/lib/dispatch.js'
import { adminRoutes, allRoutes, authRoutes, contentRoutes, metricRoutes } from '../../../server/routes/index.js'
import type { ApiRequest, ApiResponse } from '../../../server/lib/logger.js'

function makeReq(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return { method: 'GET', url: '/api/posts', headers: {}, query: {}, ...overrides }
}

function makeRes(): ApiResponse & { code: number; body: unknown } {
  const res = {
    code: 0,
    body: undefined as unknown,
    status(code: number) {
      res.code = code
      return res
    },
    json(body: unknown) {
      res.body = body
    },
    setHeader() {},
    get statusCode() {
      return res.code
    },
  }
  return res as ApiResponse & { code: number; body: unknown }
}

describe('resolveRouteName', () => {
  it('prefers the ?route tag a Vercel rewrite attaches', () => {
    const req = makeReq({ url: '/api/content?route=post&slug=x', query: { route: 'post', slug: 'x' } })
    expect(resolveRouteName(req)).toBe('post')
  })

  it('falls back to the last path segment when untagged', () => {
    expect(resolveRouteName(makeReq({ url: '/api/posts' }))).toBe('posts')
  })

  it('ignores the query string and a trailing slash in the fallback', () => {
    expect(resolveRouteName(makeReq({ url: '/api/post?slug=a-post' }))).toBe('post')
    expect(resolveRouteName(makeReq({ url: '/api/notes/' }))).toBe('notes')
  })
})

describe('createDispatcher', () => {
  it('delegates to the handler named by the route tag', async () => {
    const handler = vi.fn(async () => {})
    const dispatch = createDispatcher({ posts: handler })
    const req = makeReq({ query: { route: 'posts' } })
    const res = makeRes()

    await dispatch(req, res)

    expect(handler).toHaveBeenCalledWith(req, res)
  })

  it('404s an unknown route rather than throwing', async () => {
    const dispatch = createDispatcher({ posts: vi.fn(async () => {}) })
    const res = makeRes()

    await dispatch(makeReq({ query: { route: 'nope' } }), res)

    expect(res.code).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('refuses to reach a handler outside its own group', async () => {
    const adminPosts = vi.fn(async () => {})
    const authDispatch = createDispatcher(authRoutes)
    const res = makeRes()

    // /api/auth?route=admin-posts must not cross into the admin group.
    await authDispatch(makeReq({ query: { route: 'admin-posts' } }), res)

    expect(adminPosts).not.toHaveBeenCalled()
    expect(res.code).toBe(404)
  })
})

describe('vercel.json routing contract', () => {
  const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
    rewrites: { source: string; destination: string }[]
  }

  const groups: Record<string, typeof allRoutes> = {
    auth: authRoutes,
    admin: adminRoutes,
    content: contentRoutes,
    metrics: metricRoutes,
  }

  it('rewrites every route onto the group that actually owns it', () => {
    for (const name of Object.keys(allRoutes)) {
      const rewrite = vercel.rewrites.find(r => r.source === `/api/${name}`)
      expect(rewrite, `missing rewrite for /api/${name}`).toBeDefined()

      const [, group, tag] = rewrite!.destination.match(/^\/api\/(\w+)\?route=(.+)$/) ?? []
      expect(tag, `/api/${name} must keep its route tag`).toBe(name)
      expect(groups[group], `/api/${name} points at unknown group ${group}`).toBeDefined()
      expect(Object.keys(groups[group])).toContain(name)
    }
  })

  it('keeps the SPA fallback last so it cannot swallow /api', () => {
    const last = vercel.rewrites[vercel.rewrites.length - 1]
    expect(last.destination).toBe('/index.html')
  })

  it('stays under the 12-function Hobby cap', () => {
    expect(Object.keys(groups).length).toBeLessThanOrEqual(12)
  })
})
