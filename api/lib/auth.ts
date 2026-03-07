import jwt, { type JwtPayload } from 'jsonwebtoken'
import type { Context, MiddlewareHandler } from 'hono'

export interface UserPayload extends JwtPayload {
  id: string
  email: string
  name: string
}

export type AppBindings = {
  Variables: {
    user: UserPayload
    requestId: string
    requestIp: string
  }
}

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'

export function signToken(payload: Pick<UserPayload, 'id' | 'email' | 'name'>): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): UserPayload {
  const decoded = jwt.verify(token, SECRET)
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload')
  }
  return decoded as UserPayload
}

export const requireAuth: MiddlewareHandler<AppBindings> = async (ctx, next) => {
  const header = ctx.req.header('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return ctx.json({ error: 'Unauthorized' }, 401)
  }

  try {
    ctx.set('user', verifyToken(token))
    await next()
  } catch {
    return ctx.json({ error: 'Invalid or expired token' }, 401)
  }
}

export function getUser(ctx: Context<AppBindings>): UserPayload {
  return ctx.get('user')
}
