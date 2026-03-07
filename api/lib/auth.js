import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}

/**
 * Hono middleware — validates Bearer JWT, attaches user to ctx
 */
export async function requireAuth(ctx, next) {
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
