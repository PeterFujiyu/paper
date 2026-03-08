import 'dotenv/config'
import { createServer } from 'node:http'
import { parse as parseUrl } from 'node:url'
import postsHandler from '../api/posts.js'
import postHandler from '../api/post.js'
import adminPostsHandler from '../api/admin-posts.js'
import adminPostHandler from '../api/admin-post.js'
import slugCheckHandler from '../api/slug-check.js'
import authLoginHandler from '../api/auth-login.js'
import authRegisterHandler from '../api/auth-register.js'
import authMeHandler from '../api/auth-me.js'
import type { ApiRequest, ApiResponse } from './lib/logger.js'

const routes: Record<string, (req: ApiRequest, res: ApiResponse) => Promise<void>> = {
  '/api/posts': postsHandler,
  '/api/post': postHandler,
  '/api/admin-posts': adminPostsHandler,
  '/api/admin-post': adminPostHandler,
  '/api/slug-check': slugCheckHandler,
  '/api/auth-login': authLoginHandler,
  '/api/auth-register': authRegisterHandler,
  '/api/auth-me': authMeHandler,
}

createServer(async (req, res) => {
  const url = parseUrl(req.url ?? '', true)
  const handler = routes[url.pathname ?? '']

  if (!handler) {
    res.statusCode = 404
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
