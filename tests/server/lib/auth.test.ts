// JWT_SECRET is injected by tests/setup.ts before this module loads.
import { describe, it, expect } from 'vitest'
import { signToken, verifyToken, getBearerToken, getCookie, getAuthToken, setAuthCookie, clearAuthCookie } from '../../../server/lib/auth.js'

// ---------------------------------------------------------------------------
// signToken / verifyToken
// ---------------------------------------------------------------------------
describe('signToken / verifyToken', () => {
  const payload = { id: 'user-1', email: 'user@example.com', name: 'Alice' }

  it('returns a non-empty string', () => {
    const token = signToken(payload)
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('round-trips through verifyToken', () => {
    const token = signToken(payload)
    const decoded = verifyToken(token)
    expect(decoded.id).toBe(payload.id)
    expect(decoded.email).toBe(payload.email)
    expect(decoded.name).toBe(payload.name)
  })

  it('throws for a tampered token', () => {
    const token = signToken(payload)
    const tampered = token.slice(0, -4) + 'xxxx'
    expect(() => verifyToken(tampered)).toThrow()
  })

  it('throws for a completely invalid string', () => {
    expect(() => verifyToken('not.a.jwt')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// getBearerToken
// ---------------------------------------------------------------------------
describe('getBearerToken', () => {
  it('extracts the token from a Bearer header', () => {
    expect(getBearerToken('Bearer mytoken123')).toBe('mytoken123')
  })

  it('returns null if header does not start with Bearer', () => {
    expect(getBearerToken('Basic abc')).toBeNull()
  })

  it('returns null for an empty header', () => {
    expect(getBearerToken('')).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(getBearerToken(undefined)).toBeNull()
  })

  it('uses the first element of an array header', () => {
    expect(getBearerToken(['Bearer token-a', 'Bearer token-b'])).toBe('token-a')
  })
})

// ---------------------------------------------------------------------------
// getCookie
// ---------------------------------------------------------------------------
describe('getCookie', () => {
  it('parses a simple cookie', () => {
    expect(getCookie('name=value', 'name')).toBe('value')
  })

  it('parses one cookie among many', () => {
    expect(getCookie('foo=bar; target=hello; baz=qux', 'target')).toBe('hello')
  })

  it('URL-decodes cookie values', () => {
    expect(getCookie('tok=hello%20world', 'tok')).toBe('hello world')
  })

  it('returns null when cookie is absent', () => {
    expect(getCookie('foo=bar', 'missing')).toBeNull()
  })

  it('returns null for undefined header', () => {
    expect(getCookie(undefined, 'name')).toBeNull()
  })

  it('handles array headers by reading the first element', () => {
    expect(getCookie(['a=1; b=2', 'c=3'], 'b')).toBe('2')
  })

  it('handles cookies with = in the value', () => {
    const raw = 'jwt=header.payload.sig==; other=x'
    expect(getCookie(raw, 'jwt')).toBe('header.payload.sig==')
  })
})

// ---------------------------------------------------------------------------
// getAuthToken
// ---------------------------------------------------------------------------
describe('getAuthToken', () => {
  it('prefers the Authorization header Bearer token', () => {
    const headers = {
      authorization: 'Bearer bearer-token',
      cookie: 'pf_admin_session=cookie-token',
    }
    expect(getAuthToken(headers)).toBe('bearer-token')
  })

  it('falls back to the session cookie', () => {
    const headers = { cookie: 'pf_admin_session=cookie-token' }
    expect(getAuthToken(headers)).toBe('cookie-token')
  })

  it('returns null when neither is present', () => {
    expect(getAuthToken({})).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// setAuthCookie / clearAuthCookie
// ---------------------------------------------------------------------------
describe('setAuthCookie', () => {
  it('sets a Set-Cookie header containing the token', () => {
    const headers: Record<string, string> = {}
    const res = { setHeader: (k: string, v: string) => { headers[k] = v } }
    setAuthCookie(res, 'my-jwt-token')
    expect(headers['Set-Cookie']).toContain(encodeURIComponent('my-jwt-token'))
    expect(headers['Set-Cookie']).toContain('HttpOnly')
    expect(headers['Set-Cookie']).toContain('SameSite=Strict')
  })
})

describe('clearAuthCookie', () => {
  it('sets Max-Age=0 and an expired Expires header', () => {
    const headers: Record<string, string> = {}
    const res = { setHeader: (k: string, v: string) => { headers[k] = v } }
    clearAuthCookie(res)
    expect(headers['Set-Cookie']).toContain('Max-Age=0')
    expect(headers['Set-Cookie']).toContain('Expires=')
  })
})
