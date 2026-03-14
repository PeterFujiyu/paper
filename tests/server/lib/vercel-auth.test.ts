// connectDB and the User model are mocked so requireAuth never touches a
// real database.  vi.hoisted() is required because vi.mock() factories are
// hoisted above all import statements.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindById = vi.hoisted(() => vi.fn())

vi.mock('../../../server/lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../server/models/User.js', () => ({
  default: { findById: mockFindById },
}))

import { signToken } from '../../../server/lib/auth.js'
import { requireAuth } from '../../../server/lib/vercel-auth.js'
import type { ApiRequest, ApiResponse, RequestMeta } from '../../../server/lib/logger.js'

// ---------------------------------------------------------------------------
// Minimal test doubles
// ---------------------------------------------------------------------------

function makeReq(token: string): ApiRequest {
  return {
    method: 'GET',
    headers: { cookie: `pf_admin_session=${encodeURIComponent(token)}` },
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

function makeMeta(): RequestMeta {
  return { requestId: 'r1', requestIp: '127.0.0.1', startedAt: 0, userId: null }
}

// Wire findById to return a lean() result without opening a real connection.
function stubUser(doc: Record<string, unknown> | null): void {
  mockFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(doc) }),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requireAuth — tokenVersion field handling', () => {
  beforeEach(() => vi.clearAllMocks())

  // Regression: legacy documents written before the tokenVersion column was
  // added don't have the field at all.  lean() returns the object without the
  // key (value is undefined, not 0).  requireAuth must still accept a token
  // that was signed with tkv: 0.
  it('accepts tkv: 0 when user document has no tokenVersion field (legacy user)', async () => {
    stubUser({ _id: 'user-1' }) // tokenVersion key is absent

    const token = signToken({ id: 'user-1', email: 'a@b.com', name: 'Alice', tkv: 0 })
    const res = makeRes()
    const result = await requireAuth(makeReq(token), res, makeMeta())

    expect(result).not.toBeNull()
    expect(result?.id).toBe('user-1')
    // No error response should have been sent.
    expect((res as { statusCode?: number }).statusCode).toBeUndefined()
  })

  it('accepts tkv: 0 when document has tokenVersion: 0', async () => {
    stubUser({ _id: 'user-1', tokenVersion: 0 })

    const token = signToken({ id: 'user-1', email: 'a@b.com', name: 'Alice', tkv: 0 })
    const result = await requireAuth(makeReq(token), makeRes(), makeMeta())

    expect(result).not.toBeNull()
  })

  it('rejects with 401 when tkv does not match stored tokenVersion', async () => {
    stubUser({ _id: 'user-1', tokenVersion: 2 })

    // Token carries tkv: 1 but the document is already at version 2.
    const token = signToken({ id: 'user-1', email: 'a@b.com', name: 'Alice', tkv: 1 })
    const res = makeRes()
    const result = await requireAuth(makeReq(token), res, makeMeta())

    expect(result).toBeNull()
    expect((res as { statusCode?: number }).statusCode).toBe(401)
  })
})
