type HeaderWriter = {
  setHeader(name: string, value: string): void
}

/**
 * Cache policy for public content reads (posts, notes, and their listings).
 *
 * These responses are identical for every visitor — the routes filter to
 * published content and never read the session — so the CDN can hold one copy
 * and answer from it. Before this, every essay view reached the function.
 *
 * - `max-age=0` keeps browsers revalidating, so view counts stay live for the
 *   person reading.
 * - `s-maxage=60` is the CDN's window. A publish therefore shows up within a
 *   minute rather than instantly; there is no purge-on-publish step, and for a
 *   personal blog that trade is worth the saved invocations.
 * - `stale-while-revalidate` lets the CDN answer immediately from a slightly
 *   stale copy while it refreshes behind the request.
 *
 * Anything auth-gated (every `admin-*` route) must keep `no-store` instead — a
 * shared cache must never hold a response that depended on a session.
 */
export const PUBLIC_READ_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'

/** Applies the public-read policy. Only for responses that carry no session data. */
export function setPublicReadCache(res: HeaderWriter): void {
  res.setHeader('Cache-Control', PUBLIC_READ_CACHE_CONTROL)
}
