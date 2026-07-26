// connectDB, the User model and the auth throttle are mocked so the handler
// never touches a real database.  vi.hoisted() is required because vi.mock()
// factories are hoisted above all import statements.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findOneAndUpdate: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue('hashed-new'),
  checkAuthThrottle: vi.fn().mockResolvedValue(null),
  recordAuthFailure: vi.fn().mockResolvedValue(undefined),
  clearAuthFailures: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../server/lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../server/lib/auth-throttle.js', () => ({
  checkAuthThrottle: mocks.checkAuthThrottle,
  recordAuthFailure: mocks.recordAuthFailure,
  clearAuthFailures: mocks.clearAuthFailures,
}))

vi.mock('../../server/models/User.js', () => ({
  default: {
    findById: mocks.findById,
    findOneAndUpdate: mocks.findOneAndUpdate,
    hashPassword: mocks.hashPassword,
  },
}))

import handler from '../../server/routes/auth-password.js'
import { signToken } from '../../server/lib/auth.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

// ---------------------------------------------------------------------------
// Minimal test doubles
// ---------------------------------------------------------------------------

type UserDouble = {
  _id: string
  email: string
  name: string
  password: string
  tokenVersion: number
  comparePassword: ReturnType<typeof vi.fn>
}

function makeUser(overrides: Partial<UserDouble> = {}): UserDouble {
  return {
    _id: 'user-1',
    email: 'a@b.com',
    name: 'Alice',
    password: 'hashed-old',
    tokenVersion: 2,
    comparePassword: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

/**
 * A Mongoose-ish query double: awaitable AND chainable via .select()/.lean(),
 * because requireAuth chains .select().lean() while the handler awaits
 * .select() directly.
 */
function query<T>(value: T) {
  const promise = Promise.resolve(value) as Promise<T> & {
    select: () => ReturnType<typeof query<T>>
    lean: () => ReturnType<typeof query<T>>
  }
  promise.select = () => query(value)
  promise.lean = () => query(value)
  return promise
}

function resolveUser(user: UserDouble | null) {
  mocks.findById.mockReturnValue(query(user))
}

/** The document findOneAndUpdate returns; null models a lost compare-and-swap. */
function resolveUpdate(updated: { email: string; name: string; tokenVersion: number } | null) {
  mocks.findOneAndUpdate.mockReturnValue(query(updated))
}

function makeReq(
  body: unknown,
  options: { token?: string; method?: string } = {},
): ApiRequest {
  const { token, method = 'POST' } = options
  return {
    method,
    url: '/api/auth-password',
    headers: {
      cookie: token ? `pf_admin_session=${encodeURIComponent(token)}` : '',
    },
    body,
  } as ApiRequest
}

function makeRes(): ApiResponse {
  return {
    statusCode: undefined,
    status(code: number) {
      (this as { statusCode?: number }).statusCode = code
      return this
    },
    json: vi.fn(),
    setHeader: vi.fn(),
  }
}

function sentStatus(res: ApiResponse): number | undefined {
  return (res as { statusCode?: number }).statusCode
}

function sentBody(res: ApiResponse): Record<string, unknown> {
  const json = res.json as unknown as ReturnType<typeof vi.fn>
  return json.mock.calls.at(-1)?.[0] as Record<string, unknown>
}

function setCookieHeader(res: ApiResponse): string | undefined {
  const setHeader = res.setHeader as unknown as ReturnType<typeof vi.fn>
  const call = setHeader.mock.calls.find(([name]) => String(name).toLowerCase() === 'set-cookie')
  return call ? String(call[1]) : undefined
}

/** A valid session token matching makeUser()'s tokenVersion. */
function validToken(tkv = 2): string {
  return signToken({ id: 'user-1', email: 'a@b.com', name: 'Alice', tkv })
}

const VALID_BODY = { currentPassword: 'old-password', newPassword: 'new-password' }

type UpdateCall = [Record<string, unknown>, Record<string, Record<string, unknown>>, ...unknown[]]

function updateCall(): UpdateCall {
  return mocks.findOneAndUpdate.mock.calls[0] as UpdateCall
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth-password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkAuthThrottle.mockResolvedValue(null)
    mocks.hashPassword.mockResolvedValue('hashed-new')
    // requireAuth reads tokenVersion via findById(...).select(...).lean().
    resolveUser(makeUser())
    resolveUpdate({ email: 'a@b.com', name: 'Alice', tokenVersion: 3 })
  })

  it('rejects non-POST methods with 405', async () => {
    const res = makeRes()
    await handler(makeReq(VALID_BODY, { token: validToken(), method: 'GET' }), res)

    expect(sentStatus(res)).toBe(405)
  })

  it('rejects an unauthenticated request with 401', async () => {
    const res = makeRes()
    await handler(makeReq(VALID_BODY), res)

    expect(sentStatus(res)).toBe(401)
    expect(mocks.checkAuthThrottle).not.toHaveBeenCalled()
  })

  it('rejects a short new password with 400', async () => {
    const res = makeRes()
    await handler(
      makeReq({ currentPassword: 'old-password', newPassword: 'short' }, { token: validToken() }),
      res,
    )

    expect(sentStatus(res)).toBe(400)
    expect(sentBody(res).error).toBe('Password must be at least 8 characters.')
  })

  it('rejects a new password identical to the current one with 400', async () => {
    const res = makeRes()
    await handler(
      makeReq({ currentPassword: 'old-password', newPassword: 'old-password' }, { token: validToken() }),
      res,
    )

    expect(sentStatus(res)).toBe(400)
  })

  it('returns 429 while the IP is throttled', async () => {
    mocks.checkAuthThrottle.mockResolvedValue('Too many attempts. Try again in 5 minutes.')
    const res = makeRes()
    await handler(makeReq(VALID_BODY, { token: validToken() }), res)

    expect(sentStatus(res)).toBe(429)
  })

  // A wrong current password must NOT be a 401: the admin client treats every
  // 401 as a dead session and redirects to /admin/login, so a typo would sign
  // the user out mid-form.
  it('returns 403 (not 401) on a wrong current password and records the failure', async () => {
    resolveUser(makeUser({ comparePassword: vi.fn().mockResolvedValue(false) }))

    const res = makeRes()
    await handler(makeReq(VALID_BODY, { token: validToken() }), res)

    expect(sentStatus(res)).toBe(403)
    expect(mocks.recordAuthFailure).toHaveBeenCalledWith('password', expect.any(String))
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('writes the hash and bumps tokenVersion, then re-sets the cookie', async () => {
    const res = makeRes()
    await handler(makeReq(VALID_BODY, { token: validToken() }), res)

    expect(sentStatus(res)).toBe(200)
    expect(sentBody(res).ok).toBe(true)
    expect(mocks.clearAuthFailures).toHaveBeenCalledWith('password', expect.any(String))

    // The plaintext must never reach the update — only the hash.
    expect(mocks.hashPassword).toHaveBeenCalledWith('new-password')
    const [, update] = updateCall()
    expect(update.$set.password).toBe('hashed-new')
    expect(update.$inc.tokenVersion).toBe(1)

    expect(setCookieHeader(res)).toContain('pf_admin_session=')
  })

  // Regression: a read/modify/save let two concurrent changes both move N → N+1
  // and both receive a valid cookie, leaving a session alive that the change
  // was supposed to revoke. The update is now a compare-and-swap against the
  // version this session authenticated with.
  it('scopes the update to the session\'s own token version', async () => {
    const res = makeRes()
    await handler(makeReq(VALID_BODY, { token: validToken(2) }), res)

    const [filter] = updateCall()
    expect(filter._id).toBe('user-1')
    expect(filter.tokenVersion).toBe(2)
  })

  // With tkv: 0 the filter must also match legacy documents that pre-date the
  // tokenVersion field, matching requireAuth's `?? 0` treatment.
  it('includes the $exists: false branch when tkv is 0', async () => {
    resolveUser(makeUser({ tokenVersion: 0 }))
    resolveUpdate({ email: 'a@b.com', name: 'Alice', tokenVersion: 1 })

    const res = makeRes()
    await handler(makeReq(VALID_BODY, { token: validToken(0) }), res)

    const [filter] = updateCall()
    const branches = filter.$or as Array<Record<string, unknown>>
    expect(branches).toContainEqual({ tokenVersion: 0 })
    expect(branches).toContainEqual({ tokenVersion: { $exists: false } })
  })

  // Losing the compare-and-swap means a concurrent change already bumped the
  // version — this session is stale and must not be handed a fresh cookie.
  it('returns 409 without a cookie when the compare-and-swap loses', async () => {
    resolveUpdate(null)

    const res = makeRes()
    await handler(makeReq(VALID_BODY, { token: validToken() }), res)

    expect(sentStatus(res)).toBe(409)
    expect(setCookieHeader(res)).toBeUndefined()
  })

  it('signs the new cookie at the version the update returned', async () => {
    resolveUpdate({ email: 'a@b.com', name: 'Alice', tokenVersion: 9 })

    const res = makeRes()
    await handler(makeReq(VALID_BODY, { token: validToken() }), res)

    const cookie = setCookieHeader(res)!
    const token = decodeURIComponent(cookie.split('pf_admin_session=')[1]!.split(';')[0]!)
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString())
    expect(payload.tkv).toBe(9)
  })
})
