import 'dotenv/config'
import { createServer, type IncomingMessage } from 'node:http'
import { parse as parseUrl } from 'node:url'
import type { ApiRequest, ApiResponse } from './lib/logger.js'
import { allRoutes, type RouteHandler } from './routes/index.js'
import { applySecurityHeaders } from './lib/security.js'
import { paperMcpFetch } from './mcp/server.js'

// Same table the api/ dispatchers serve, so dev and prod cannot drift apart.
const routes: Record<string, RouteHandler> = Object.fromEntries(
  Object.entries(allRoutes).map(([name, handler]) => [`/api/${name}`, handler]),
)

/**
 * The request body as bytes, decoded once at the end.
 *
 * Appending each chunk to a string would decode them independently, and a
 * multi-byte character split across a chunk boundary becomes two replacement
 * characters — which is every essay with a CJK title long enough to arrive in
 * more than one piece.
 */
async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  }
  return Buffer.concat(chunks).toString('utf8')
}

// Framing belongs to whoever writes the body, and fetch rewrites it from the
// body we hand over; forwarding the originals would describe the old request.
const UNFORWARDED_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'transfer-encoding',
])

createServer(async (req, res) => {
  const url = parseUrl(req.url ?? '', true)

  // MCP owns its request body and uses the web-standard Request/Response
  // contract. Mount it before the normal API parser drains the Node stream.
  if (url.pathname === '/api/mcp') {
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (UNFORWARDED_HEADERS.has(name.toLowerCase())) continue
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item === 'string') headers.append(name, item)
      }
    }

    const rawBody = await readRawBody(req)
    const method = req.method ?? 'GET'
    const request = new Request(new URL(req.url ?? '/api/mcp', 'http://localhost:3001'), {
      method,
      headers,
      ...(rawBody && method !== 'GET' && method !== 'HEAD' ? { body: rawBody } : {}),
    })
    const response = await paperMcpFetch(request)

    res.statusCode = response.status
    response.headers.forEach((value, name) => res.setHeader(name, value))
    res.end(Buffer.from(await response.arrayBuffer()))
    return
  }

  const handler = routes[url.pathname ?? '']

  if (!handler) {
    res.statusCode = 404
    applySecurityHeaders(res)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  const rawBody = await readRawBody(req)

  let parsedBody: unknown = undefined
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      parsedBody = rawBody
    }
  }

  const request: ApiRequest = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    query: url.query as Record<string, string | string[] | undefined>,
    body: parsedBody,
  }

  const response: ApiResponse = {
    status(code: number) {
      res.statusCode = code
      return response
    },
    json(body: unknown) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json')
      }
      res.end(JSON.stringify(body))
    },
    // Mirrors Vercel's res.send for the HTML route; the caller sets Content-Type.
    send(body: string) {
      res.end(body)
    },
    setHeader(name: string, value: string) {
      res.setHeader(name, value)
    },
    get statusCode() {
      return res.statusCode
    },
  }

  await handler(request, response)
}).listen(3001, () => {
  console.log('API running at http://localhost:3001')
})
