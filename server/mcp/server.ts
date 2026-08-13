import {
  createMcpHandler,
  localhostAllowedOrigins,
  originValidationResponse,
} from '@modelcontextprotocol/server'

import { clientKey, consumeToken, type RateLimitOptions } from '../lib/rate-limit.js'
import { applySecurityHeaders } from '../lib/security.js'
import { createPaperMcpServer, PUBLIC_MCP_CACHE_HINT } from './factory.js'

// Generous for an agent working through a question, cheap to survive a loop:
// a burst of 30 calls, then 30 a minute. Every request counts, including the
// 405s, since the cost being bounded is the invocation itself.
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
  const originRejected = originValidationResponse(request, allowedOriginHostnames())
  if (originRejected) return withSecurityHeaders(originRejected)

  // Metered before dispatch: the tools behind this reach MongoDB, and nothing
  // in front of it caches a POST.
  const limit = consumeToken(clientKey(request.headers), MCP_RATE_LIMIT)
  if (!limit.allowed) {
    return withSecurityHeaders(rpcErrorResponse(429, 'Too many requests', {
      'Retry-After': String(limit.retryAfterSeconds),
    }))
  }

  return withSecurityHeaders(await paperMcpHandler.fetch(request))
}

export { createPaperMcpServer }
