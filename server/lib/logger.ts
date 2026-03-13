import { applySecurityHeaders } from './security.js'

export type ApiRequest = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
  body?: unknown
}

export type ApiResponse = {
  status(code: number): ApiResponse
  json(body: unknown): void
  setHeader(name: string, value: string): void
  statusCode?: number
}

export type RequestMeta = {
  requestId: string
  requestIp: string
  startedAt: number
  userId: string | null
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function beginRequest(req: ApiRequest): RequestMeta {
  return {
    requestId: crypto.randomUUID(),
    requestIp:
      firstHeaderValue(req.headers['x-forwarded-for'])?.split(',')[0]?.trim() ??
      firstHeaderValue(req.headers['x-real-ip']) ??
      'unknown',
    startedAt: performance.now(),
    userId: null,
  }
}

export function finishRequest(req: ApiRequest, res: ApiResponse, meta: RequestMeta): void {
  const durationMs = Math.round((performance.now() - meta.startedAt) * 10) / 10
  const isDev = process.env.NODE_ENV !== 'production'
  const statusCode = getStatusCode(res)
  const isError = statusCode >= 400

  if (isDev || isError) {
    console.log(
      `[api] ${meta.requestId} ${meta.requestIp}${meta.userId ? ` user=${meta.userId}` : ''} ${req.method ?? 'GET'} ${req.url ?? ''} ${statusCode} ${durationMs}ms`
    )
  }
}

export function logError(label: string, meta: RequestMeta, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown error'
  console.error(`${label} ${meta.requestId}`, message)
}

export function sendJson(res: ApiResponse, status: number, body: unknown, meta?: RequestMeta): void {
  applySecurityHeaders(res)
  if (meta) {
    res.setHeader('x-request-id', meta.requestId)
  }
  res.status(status).json(body)
}

export function readBody<T>(req: ApiRequest): T {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body) as T
  }
  return (req.body ?? {}) as T
}

export function getQueryParam(req: ApiRequest, key: string): string {
  const value = req.query?.[key]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getStatusCode(res: ApiResponse): number {
  const maybe = res as ApiResponse & { statusCode?: number }
  return maybe.statusCode ?? 200
}
