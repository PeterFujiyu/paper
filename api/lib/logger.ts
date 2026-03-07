import type { MiddlewareHandler } from 'hono'
import type { AppBindings } from './auth'

function getRequestIp(headerValue: string | undefined, fallback: string | undefined): string {
  return headerValue?.split(',')[0]?.trim() || fallback || 'unknown'
}

function createRequestId(): string {
  return crypto.randomUUID()
}

export function getRequestMeta(ctx: { get(key: 'requestId'): string; get(key: 'requestIp'): string }): { requestId: string; requestIp: string } {
  return {
    requestId: ctx.get('requestId'),
    requestIp: ctx.get('requestIp'),
  }
}

function getRequestUserId(ctx: { get(key: 'user'): { id?: string } }): string | null {
  try {
    return ctx.get('user')?.id ?? null
  } catch {
    return null
  }
}

export const requestLogger: MiddlewareHandler<AppBindings> = async (ctx, next) => {
  const startedAt = performance.now()
  const requestId = createRequestId()
  const requestIp = getRequestIp(
    ctx.req.header('x-forwarded-for') ?? undefined,
    ctx.req.header('x-real-ip') ?? undefined
  )

  ctx.set('requestId', requestId)
  ctx.set('requestIp', requestIp)

  await next()
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10
  const userId = getRequestUserId(ctx)

  const isDev = process.env.NODE_ENV !== 'production'
  const isError = ctx.res.status >= 400

  if (isDev || isError) {
    console.log(
      `[api] ${requestId} ${requestIp}${userId ? ` user=${userId}` : ''} ${ctx.req.method} ${ctx.req.path} ${ctx.res.status} ${durationMs}ms`
    )
  }
}
