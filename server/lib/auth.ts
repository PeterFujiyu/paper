import jwt, { type JwtPayload } from 'jsonwebtoken'

export interface UserPayload extends JwtPayload {
  id: string
  email: string
  name: string
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

export function getBearerToken(header?: string | string[]): string | null {
  const value = Array.isArray(header) ? header[0] : header ?? ''
  return value.startsWith('Bearer ') ? value.slice(7) : null
}
