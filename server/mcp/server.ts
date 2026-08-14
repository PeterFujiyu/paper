import {
  createMcpHandler,
  localhostAllowedOrigins,
  originValidationResponse,
} from '@modelcontextprotocol/server'

import { clientKey, consumeToken, type RateLimitOptions } from '../lib/rate-limit.js'
import { applySecurityHeaders } from '../lib/security.js'
import { createPaperMcpServer, PUBLIC_MCP_CACHE_HINT } from './factory.js'

// Generous for an agent working through a question, cheap to survive a loop:
// a burst of 30 calls, then 30 a minute. Every request counts except the CORS
// preflight — even a 405 is an invocation, which is the cost being bounded,
// while an OPTIONS is answered here and would otherwise halve a browser
// client's real budget.
const MCP_RATE_LIMIT: RateLimitOptions = { capacity: 30, refillPerSecond: 0.5 }

const paperMcpHandler = createMcpHandler(
  () => createPaperMcpServer({
    name: 'paper',
    cacheHint: PUBLIC_MCP_CACHE_HINT,
  }),
  {
    responseMode: 'json',
    legacy: 'reject',
    onerror(error) {
      console.error('[mcp] transport error', error.message)
    },
  },
)

function hostnameFrom(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname
  } catch {
    return undefined
  }
}

function allowedOriginHostnames(): string[] {
  const configured = [
    process.env.SITE_ORIGIN,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]
    .map(hostnameFrom)
    .filter((hostname): hostname is string => Boolean(hostname))

  // Localhost is a legitimate MCP origin only on a developer's own machine, so
  // it takes an explicit opt-in. Keying this on `NODE_ENV !== 'production'`
  // would hand any deployment that never sets NODE_ENV — a preview build, say —
  // an allowlist entry that every attacker can serve a page from.
  const local = process.env.MCP_ALLOW_LOCALHOST_ORIGIN === 'true'
    ? localhostAllowedOrigins()
    : []

  return [...new Set([...configured, ...local])]
}

/** The rejection shape the protocol uses for a request refused before dispatch. */
function rpcErrorResponse(status: number, message: string, headers?: HeadersInit): Response {
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
    { status, headers: { 'Content-Type': 'application/json', ...headers } },
  )
}

// What a browser MCP client sends. The protocol headers are not on the CORS
// safelist, so a cross-origin client cannot send them unless they are named here.
const ALLOWED_REQUEST_HEADERS = [
  'Content-Type',
  'Accept',
  'MCP-Protocol-Version',
  'Mcp-Method',
  'Mcp-Name',
].join(', ')

/**
 * Grant the cross-origin permission that passing origin validation implies.
 *
 * Allowing an origin only decides whether the request is answered; without
 * these the browser discards the answer, so a validated origin still could not
 * connect. The header echoes the caller's own origin rather than `*` — the
 * allowlist has already accepted it — and `Vary` keeps a shared cache from
 * handing one origin's response to another.
 */
function withCorsHeaders(response: Response, allowedOrigin: string | null): Response {
  if (!allowedOrigin) return response

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', allowedOrigin)
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', ALLOWED_REQUEST_HEADERS)
  // Retry-After is not on the response safelist, so without this a browser
  // client can see the 429 but not how long to wait.
  headers.set('Access-Control-Expose-Headers', 'Retry-After')
  headers.set('Access-Control-Max-Age', '86400')
  headers.append('Vary', 'Origin')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  applySecurityHeaders({
    setHeader(name, value) {
      headers.set(name, value)
    },
  })
  headers.set('Cache-Control', 'no-store')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function paperMcpFetch(request: Request): Promise<Response> {
  const allowed = allowedOriginHostnames()
  const originRejected = originValidationResponse(request, allowed)
  if (originRejected) return withSecurityHeaders(originRejected)

  // Validation passed, so an Origin present here is one of ours — but check it
  // against the list rather than trusting that, since validation also passes a
  // request that carries no Origin at all. Those are non-browser clients, which
  // need no CORS headers.
  const origin = request.headers.get('origin')
  const originHostname = hostnameFrom(origin ?? undefined)
  const corsOrigin = origin && originHostname && allowed.includes(originHostname)
    ? origin
    : null

  // The preflight is unmetered: it reaches no tool and no database, and
  // charging for it would halve a browser client's real budget.
  if (request.method === 'OPTIONS') {
    return withCorsHeaders(withSecurityHeaders(new Response(null, { status: 204 })), corsOrigin)
  }

  // Metered before dispatch: the tools behind this reach MongoDB, and nothing
  // in front of it caches a POST.
  const limit = consumeToken(clientKey(request.headers), MCP_RATE_LIMIT)
  if (!limit.allowed) {
    return withCorsHeaders(
      withSecurityHeaders(rpcErrorResponse(429, 'Too many requests', {
        'Retry-After': String(limit.retryAfterSeconds),
      })),
      corsOrigin,
    )
  }

  return withCorsHeaders(withSecurityHeaders(await paperMcpHandler.fetch(request)), corsOrigin)
}

export { createPaperMcpServer }
