// connectDB and the User model are mocked so the handler never touches a
// real database.  vi.hoisted() is required because vi.mock() factories are
// hoisted above all import statements.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'

const mockFindOneAndUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(null))

vi.mock('../../server/lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../server/models/User.js', () => ({
  default: { findOneAndUpdate: mockFindOneAndUpdate },
}))

import handler from '../../api/auth-logout.js'
import { signToken } from '../../server/lib/auth.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

// The same secret that tests/setup.ts injects into process.env.JWT_SECRET.
const TEST_SECRET = 'test-secret-that-is-at-least-32-chars-long!!'

// ---------------------------------------------------------------------------
// Minimal test doubles
// ---------------------------------------------------------------------------

function makeReq(token?: string): ApiRequest {
  return {
    method: 'POST',
    url: '/api/auth-logout',
    headers: {
      cookie: token ? `pf_admin_session=${encodeURIComponent(token)}` : '',
    },
  }
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth-logout — stale and legacy tokens must not increment tokenVersion', () => {
  beforeEach(() => vi.clearAllMocks())

  // Regression: a JWT signed before the tkv claim was introduced has no tkv
  // field.  The old code fell back to (decoded.tkv ?? 0), which let such a
  // token silently match a user document at tokenVersion: 0 and bump valid
  // newer sessions out.  The fix guards on typeof decoded.tkv === 'number'.
  it('does not call findOneAndUpdate when token has no tkv claim (legacy JWT)', async () => {
    const legacyToken = jwt.sign(
      { id: 'user-1', email: 'a@b.com', name: 'Alice' }, // no tkv field
      TEST_SECRET,
      { expiresIn: 3600 },
    )

    await handler(makeReq(legacyToken), makeRes())

    expect(mockFindOneAndUpdate).not.toHaveBeenCalled()
  })

  // An expired token fails verifyToken; the catch block skips the $inc.
  it('does not call findOneAndUpdate when token is expired', async () => {
    const expiredToken = jwt.sign(
      { id: 'user-1', email: 'a@b.com', name: 'Alice', tkv: 0 },
      TEST_SECRET,
      { expiresIn: -1 }, // exp is 1 second in the past
    )

    await handler(makeReq(expiredToken), makeRes())

    expect(mockFindOneAndUpdate).not.toHaveBeenCalled()
  })

  // A valid token with an explicit tkv DOES trigger findOneAndUpdate, but the
  // filter uses the token's own tkv value — not a ?? 0 fallback.  That means
  // a stale token (tkv behind the DB value) finds no matching document and the
  // counter is not bumped, protecting the user's active session.
  it('calls findOneAndUpdate with the token\'s exact tkv in the filter', async () => {
    const token = signToken({ id: 'user-1', email: 'a@b.com', name: 'Alice', tkv: 3 })

    await handler(makeReq(token), makeRes())

    expect(mockFindOneAndUpdate).toHaveBeenCalledOnce()
    const [filter] = mockFindOneAndUpdate.mock.calls[0] as [Record<string, unknown>]
    expect(filter._id).toBe('user-1')
    // Must use the token's own tkv (3), not a ?? 0 default.
    expect(filter.tokenVersion).toBe(3)
  })

  // With tkv: 0 the filter also covers legacy documents where tokenVersion
  // doesn't exist yet, so genuine logouts still revoke those sessions.
  it('includes $exists: false branch in filter when tkv is 0', async () => {
    const token = signToken({ id: 'user-1', email: 'a@b.com', name: 'Alice', tkv: 0 })

    await handler(makeReq(token), makeRes())

    expect(mockFindOneAndUpdate).toHaveBeenCalledOnce()
    const [filter] = mockFindOneAndUpdate.mock.calls[0] as [Record<string, unknown>]
    // The filter uses $or to match both tokenVersion: 0 AND absent field.
    expect(filter.$or).toBeDefined()
    const branches = filter.$or as Array<Record<string, unknown>>
    expect(branches).toContainEqual({ tokenVersion: 0 })
    expect(branches).toContainEqual({ tokenVersion: { $exists: false } })
  })
})
