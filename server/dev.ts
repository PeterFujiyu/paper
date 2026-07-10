import 'dotenv/config'
import { createServer } from 'node:http'
import { parse as parseUrl } from 'node:url'
import type { ApiRequest, ApiResponse } from './lib/logger.js'
import { allRoutes, type RouteHandler } from './routes/index.js'
import { applySecurityHeaders } from './lib/security.js'

// Same table the api/ dispatchers serve, so dev and prod cannot drift apart.
const routes: Record<string, RouteHandler> = Object.fromEntries(
  Object.entries(allRoutes).map(([name, handler]) => [`/api/${name}`, handler]),
)

createServer(async (req, res) => {
  const url = parseUrl(req.url ?? '', true)
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
