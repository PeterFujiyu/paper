import {
  createMcpHandler,
  localhostAllowedOrigins,
  originValidationResponse,
} from '@modelcontextprotocol/server'

import { applySecurityHeaders } from '../lib/security.js'
import { createPaperMcpServer, PUBLIC_MCP_CACHE_HINT } from './factory.js'

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

  const local = process.env.NODE_ENV === 'production' ? [] : localhostAllowedOrigins()
  return [...new Set([...configured, ...local])]
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
  const response = originRejected ?? await paperMcpHandler.fetch(request)
  return withSecurityHeaders(response)
}

export { createPaperMcpServer }
