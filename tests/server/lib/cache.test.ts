import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PUBLIC_READ_CACHE_CONTROL, setPublicReadCache } from '../../../server/lib/cache.js'

const ROUTES_DIR = resolve(process.cwd(), 'server/routes')

const routeSource = (name: string): string =>
  readFileSync(resolve(ROUTES_DIR, name), 'utf8')

describe('PUBLIC_READ_CACHE_CONTROL', () => {
  it('lets shared caches hold the response but keeps browsers revalidating', () => {
    // max-age=0 is what keeps a reader's view count live while still letting the
    // CDN answer for everyone else.
    expect(PUBLIC_READ_CACHE_CONTROL).toContain('public')
    expect(PUBLIC_READ_CACHE_CONTROL).toContain('max-age=0')
    expect(PUBLIC_READ_CACHE_CONTROL).toMatch(/s-maxage=\d+/)
    expect(PUBLIC_READ_CACHE_CONTROL).toMatch(/stale-while-revalidate=\d+/)
    expect(PUBLIC_READ_CACHE_CONTROL).not.toContain('private')
  })

  it('sets the header it documents', () => {
    const calls: [string, string][] = []
    setPublicReadCache({ setHeader: (name, value) => void calls.push([name, value]) })

    expect(calls).toEqual([['Cache-Control', PUBLIC_READ_CACHE_CONTROL]])
  })
})

function occurrences(src: string, needle: string): number[] {
  const found: number[] = []
  for (let at = src.indexOf(needle); at !== -1; at = src.indexOf(needle, at + 1)) found.push(at)
  return found
}

/**
 * The invariant: a shared cache must never hold a response that depended on a
 * session. Checking it by filename is what let this slip once — `note.ts` looks
 * public next to `notes.ts` but gates every method behind requireAuth, so an
 * `admin-*` prefix test passed while the CDN was being told it could serve an
 * authenticated note. So compare positions instead.
 *
 * Every cache call has to sit above every auth gate, not just the first of each:
 * a mixed route like posts.ts already caches its public GET before reaching
 * requireAuth, so a first-to-first comparison would pass no matter what a later
 * authenticated branch did. Demanding the whole public region precede the gate
 * keeps the two structurally separate.
 */
function cachesBehindAuth(src: string): boolean {
  const cacheAt = occurrences(src, 'setPublicReadCache(res)')
  const authAt = occurrences(src, 'await requireAuth(')
  if (!cacheAt.length || !authAt.length) return false

  return Math.max(...cacheAt) > Math.min(...authAt)
}

describe('cache policy by route', () => {
  const routeFiles = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts') && f !== 'index.ts')

  it.each(routeFiles)('%s does not offer an auth-gated response to shared caches', (file) => {
    const src = routeSource(file)
    expect(
      cachesBehindAuth(src),
      `${file} sets the public cache policy below its requireAuth gate`
    ).toBe(false)
  })

  it('catches a cached branch below the gate even on a route that also caches above it', () => {
    const publicOnly = `
      if (req.method === 'GET') { setPublicReadCache(res); return }
      const user = await requireAuth(req, res, meta)
    `
    const mixed = `${publicOnly}
      if (req.method === 'PUT') { setPublicReadCache(res); return }
    `

    expect(cachesBehindAuth(publicOnly)).toBe(false)
    expect(cachesBehindAuth(mixed)).toBe(true)
  })

  it('keeps the public policy to the routes that were reviewed for it', () => {
    // A whitelist so reaching for it somewhere new has to be a deliberate edit.
    const users = routeFiles.filter((f) => routeSource(f).includes('setPublicReadCache'))
    expect(users.sort()).toEqual(['brews.ts', 'notes.ts', 'post-shell.ts', 'post.ts', 'posts.ts'])
  })

  it.each(['brew.ts', 'note.ts', 'post-view.ts', 'post-completion.ts'])('%s stays no-store', (file) => {
    // brew.ts and note.ts are auth-gated; the metric routes are writes whose
    // counts would be dropped by any cache.
    const src = routeSource(file)
    expect(src).toContain("res.setHeader('Cache-Control', 'no-store')")
    expect(src).not.toContain('setPublicReadCache')
  })

  it('keeps every admin route no-store', () => {
    const adminRoutes = routeFiles.filter((f) => f.startsWith('admin-'))
    expect(adminRoutes.length).toBeGreaterThan(0)

    for (const file of adminRoutes) {
      const src = routeSource(file)
      expect(src, file).toContain("res.setHeader('Cache-Control', 'no-store')")
      expect(src, file).not.toContain('setPublicReadCache')
    }
  })

  it.each(['posts.ts', 'post.ts', 'notes.ts'])('%s serves its public read from the CDN', (file) => {
    const src = routeSource(file)
    expect(src).toContain('setPublicReadCache(res)')
    expect(src).not.toContain("'no-store'")
  })
})
