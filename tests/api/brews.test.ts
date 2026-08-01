import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockRequireAuth = vi.hoisted(() => vi.fn())
const mockFind = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockAggregate = vi.hoisted(() => vi.fn())

vi.mock('../../server/lib/db.js', () => ({
  connectDB: mockConnectDB,
}))

vi.mock('../../server/lib/vercel-auth.js', () => ({
  requireAuth: mockRequireAuth,
}))

vi.mock('../../server/models/Brew.js', () => ({
  default: {
    find: mockFind,
    create: mockCreate,
    aggregate: mockAggregate,
  },
}))

import handler from '../../server/routes/brews.js'
import { PUBLIC_READ_CACHE_CONTROL } from '../../server/lib/cache.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

const storedBrew = {
  _id: 'brew-1',
  bean: 'Kochere',
  origin: 'Ethiopia',
  roaster: 'Passenger',
  method: 'V60',
  dose: 18,
  water: 300,
  temperature: 94,
  brewSeconds: 195,
  rating: 4,
  tastingNote: 'Jasmine up front.',
  pairedSlug: '',
  createdAt: '2026-07-01T00:00:00.000Z',
}

const newBrewBody = {
  bean: 'Kochere',
  origin: 'Ethiopia',
  roaster: 'Passenger',
  method: 'V60',
  dose: 18,
  water: 300,
  temperature: 94,
  brewSeconds: 195,
  rating: 4,
  tastingNote: 'Jasmine up front.',
  pairedSlug: '',
}

function makeReq(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: 'GET',
    url: '/api/brews',
    headers: {},
    ...overrides,
  }
}

function makeRes(): ApiResponse {
  return {
    statusCode: undefined,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json: vi.fn(),
    send: vi.fn(),
    setHeader: vi.fn(),
  }
}

function stubFind(result: unknown[]): { sort: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> } {
  const lean = vi.fn().mockResolvedValue(result)
  const limit = vi.fn().mockReturnValue({ lean })
  const select = vi.fn().mockReturnValue({ limit })
  const sort = vi.fn().mockReturnValue({ select })
  mockFind.mockReturnValue({ sort })
  return { sort, limit }
}

describe('api/brews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockAggregate.mockResolvedValue([])
  })

  it('returns the brew list publicly, cacheable at the CDN', async () => {
    stubFind([storedBrew])
    mockAggregate.mockResolvedValue([{ _id: 'V60', count: 1, origins: ['Ethiopia'] }])
    const res = makeRes()

    await handler(makeReq(), res)

    expect(mockRequireAuth).not.toHaveBeenCalled()
    expect(mockFind).toHaveBeenCalledWith({})
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', PUBLIC_READ_CACHE_CONTROL)
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith({
      brews: [storedBrew],
      shelf: { cups: 1, origins: 1, topMethod: 'V60' },
    })
  })

  it('tallies the shelf across every method, not just the page served', async () => {
    stubFind([storedBrew])
    mockAggregate.mockResolvedValue([
      { _id: 'V60', count: 12, origins: ['Ethiopia', 'Kenya'] },
      { _id: 'Espresso', count: 20, origins: ['Brazil', 'Ethiopia'] },
      { _id: 'AeroPress', count: 3, origins: [''] },
    ])
    const res = makeRes()

    await handler(makeReq(), res)

    // 35 cups; Brazil/Ethiopia/Kenya deduplicated across methods; the blank
    // origin on the AeroPress rows is not an origin.
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ shelf: { cups: 35, origins: 3, topMethod: 'Espresso' } })
    )
  })

  it('runs a case-insensitive substring search over searchText when q is provided', async () => {
    const { sort, limit } = stubFind([])
    const res = makeRes()

    await handler(makeReq({ url: '/api/brews?q=Ethiopia', query: { q: 'Ethiopia' } }), res)

    expect(mockFind).toHaveBeenCalledWith({ searchText: /ethiopia/i })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(limit).toHaveBeenCalledWith(20)
    expect(res.statusCode).toBe(200)
  })

  it('escapes a search query so it cannot smuggle a pattern', async () => {
    stubFind([])
    const res = makeRes()

    await handler(makeReq({ url: '/api/brews?q=a.*b', query: { q: 'a.*b' } }), res)

    expect(mockFind).toHaveBeenCalledWith({ searchText: /a\.\*b/i })
  })

  it('creates a brew from a normalized body when authenticated', async () => {
    mockCreate.mockResolvedValue({ toObject: () => ({ ...storedBrew }) })
    const res = makeRes()

    await handler(makeReq({ method: 'POST', body: newBrewBody }), res)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        bean: 'Kochere',
        method: 'V60',
        searchText: 'kochere ethiopia passenger v60 jasmine up front.',
      })
    )
    expect(res.statusCode).toBe(201)
  })

  it('never returns the search projection to a client', async () => {
    mockCreate.mockResolvedValue({
      toObject: () => ({ ...storedBrew, searchText: 'kochere ethiopia' }),
    })
    const res = makeRes()

    await handler(makeReq({ method: 'POST', body: newBrewBody }), res)

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('searchText')
    expect(payload._id).toBe('brew-1')
  })

  it('does not create a brew when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(undefined)
    const res = makeRes()

    await handler(makeReq({ method: 'POST', body: newBrewBody }), res)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects a brew with no bean', async () => {
    const res = makeRes()

    await handler(makeReq({ method: 'POST', body: { ...newBrewBody, bean: '' } }), res)

    expect(mockCreate).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Bean is required.' })
  })

  it('rejects an unknown brew method', async () => {
    const res = makeRes()

    await handler(makeReq({ method: 'POST', body: { ...newBrewBody, method: 'Percolator' } }), res)

    expect(mockCreate).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('405s an unsupported method', async () => {
    const res = makeRes()

    await handler(makeReq({ method: 'DELETE' }), res)

    expect(res.statusCode).toBe(405)
  })
})
