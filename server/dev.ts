import 'dotenv/config'
import { createServer } from 'node:http'
import { parse as parseUrl } from 'node:url'
import type { ApiRequest, ApiResponse } from './lib/logger.js'
import { allRoutes, type RouteHandler } from './routes/index.js'
import { applySecurityHeaders } from './lib/security.js'
import { paperMcpFetch } from './mcp/server.js'

// Same table the api/ dispatchers serve, so dev and prod cannot drift apart.
const routes: Record<string, RouteHandler> = Object.fromEntries(
  Object.entries(allRoutes).map(([name, handler]) => [`/api/${name}`, handler]),
)

createServer(async (req, res) => {
  const url = parseUrl(req.url ?? '', true)

  // MCP owns its request body and uses the web-standard Request/Response
  // contract. Mount it before the normal API parser drains the Node stream.
  if (url.pathname === '/api/mcp') {
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item === 'string') headers.append(name, item)
      }
    }

    let rawBody = ''
    for await (const chunk of req) rawBody += chunk

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

  let rawBody = ''
  for await (const chunk of req) {
    rawBody += chunk
  }

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
