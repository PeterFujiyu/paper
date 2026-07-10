import { getQueryParam, sendJson, type ApiRequest, type ApiResponse } from './logger.js'
import type { RouteHandler, RouteTable } from '../routes/index.js'

/**
 * Resolve which route a request is for. Vercel rewrites tag the group's
 * function with ?route=<name>; local dev and direct hits fall back to the
 * last path segment, so both paths agree on the name.
 */
export function resolveRouteName(req: ApiRequest): string {
  const tagged = getQueryParam(req, 'route')
  if (tagged) return tagged

  const path = (req.url ?? '').split('?')[0].replace(/\/+$/, '')
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * Fold a group of handlers behind one serverless function. A name outside the
 * group's own table 404s, so /api/auth?route=admin-posts cannot cross groups.
 */
export function createDispatcher(routes: RouteTable): RouteHandler {
  return async function dispatch(req: ApiRequest, res: ApiResponse): Promise<void> {
    const route = routes[resolveRouteName(req)]

    if (!route) {
      sendJson(res, 404, { error: 'Not found' })
      return
    }

    // Each handler owns its own beginRequest/finishRequest and error shaping.
    await route(req, res)
  }
}
