import jwt, { type JwtPayload, type SignOptions, type VerifyOptions } from 'jsonwebtoken'

type HeaderMap = Record<string, string | string[] | undefined>

type HeaderWriter = {
  setHeader(name: string, value: string): void
}

export interface UserPayload extends JwtPayload {
  id: string
  email: string
  name: string
  // Token version — must match the value stored in the User document.
  // Increment the User.tokenVersion field to revoke all active sessions.
  tkv: number
}

const AUTH_COOKIE_NAME = 'pf_admin_session'
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
const SECRET = readJwtSecret()
// Optional audience claim that scopes tokens to a specific deployment
// environment (e.g. "production" vs "preview").  Set JWT_AUDIENCE to
// different values in each Vercel environment so that tokens signed in a
// preview deployment cannot authenticate against production.
const AUDIENCE = process.env.JWT_AUDIENCE?.trim() || undefined

function readJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()

  if (!secret) {
    throw new Error('JWT_SECRET must be configured before the API starts')
  }

  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long')
  }

  return secret
}

export function signToken(payload: Pick<UserPayload, 'id' | 'email' | 'name' | 'tkv'>): string {
  const options: SignOptions = { expiresIn: TOKEN_TTL_SECONDS }
  if (AUDIENCE) options.audience = AUDIENCE
  return jwt.sign(payload, SECRET, options)
}

export function verifyToken(token: string): UserPayload {
  const options: VerifyOptions = {}
  if (AUDIENCE) options.audience = AUDIENCE
  const decoded = jwt.verify(token, SECRET, options)
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload')
  }
  return decoded as UserPayload
}

export function getBearerToken(header?: string | string[]): string | null {
  const value = Array.isArray(header) ? header[0] : header ?? ''
  return value.startsWith('Bearer ') ? value.slice(7) : null
}

export function getCookie(header: string | string[] | undefined, name: string): string | null {
  const value = Array.isArray(header) ? header[0] : header ?? ''

  for (const part of value.split(';')) {
    const [cookieName, ...rest] = part.trim().split('=')
    if (!cookieName || cookieName !== name) continue

    try {
      return decodeURIComponent(rest.join('='))
    } catch {
      return null
    }
  }

  return null
}

export function getAuthToken(headers: HeaderMap): string | null {
  return getBearerToken(headers.authorization) ?? getCookie(headers.cookie, AUTH_COOKIE_NAME)
}

export function setAuthCookie(res: HeaderWriter, token: string): void {
  res.setHeader('Set-Cookie', serializeSessionCookie(token, TOKEN_TTL_SECONDS))
}

export function clearAuthCookie(res: HeaderWriter): void {
  res.setHeader('Set-Cookie', serializeSessionCookie('', 0))
}

function serializeSessionCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    'Path=/',
    'SameSite=Strict',
  ]

  if (maxAgeSeconds === 0) {
    parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  }

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }

  return parts.join('; ')
}
