import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockRequireAuth = vi.hoisted(() => vi.fn())
const mockFind = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('../../server/lib/db.js', () => ({
  connectDB: mockConnectDB,
}))

vi.mock('../../server/lib/vercel-auth.js', () => ({
  requireAuth: mockRequireAuth,
}))

vi.mock('../../server/models/Note.js', () => ({
  default: {
    find: mockFind,
    create: mockCreate,
  },
}))

import handler from '../../server/routes/notes.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

const helloDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
}

function makeReq(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: 'GET',
    url: '/api/notes',
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
    setHeader: vi.fn(),
  }
}

function stubFind(result: unknown[]): { sort: ReturnType<typeof vi.fn> } {
  const lean = vi.fn().mockResolvedValue(result)
  const limit = vi.fn().mockReturnValue({ lean })
  const select = vi.fn().mockReturnValue({ limit })
  const sort = vi.fn().mockReturnValue({ select })
  mockFind.mockReturnValue({ sort })
  return { sort }
}

describe('api/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  })

  it('returns the note list publicly without edge caching', async () => {
    const notes = [{ _id: 'note-1', content: helloDoc, createdAt: '2026-06-01T00:00:00.000Z' }]
    stubFind(notes)
    const res = makeRes()

    await handler(makeReq(), res)

    expect(mockRequireAuth).not.toHaveBeenCalled()
    expect(mockFind).toHaveBeenCalledWith({})
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith(notes)
  })

  it('runs a case-insensitive substring search over contentText when q is provided', async () => {
    const { sort } = stubFind([])
    const res = makeRes()

    await handler(makeReq({ url: '/api/notes?q=craft', query: { q: 'craft' } }), res)

    expect(mockFind).toHaveBeenCalledWith({ contentText: /craft/i })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(res.statusCode).toBe(200)
  })

  it('creates a note from sanitized content when authenticated', async () => {
    mockCreate.mockResolvedValue({
      toObject: () => ({
        _id: 'note-1',
        content: helloDoc,
        contentText: 'hello world',
        createdAt: '2026-07-01T00:00:00.000Z',
      }),
    })
    const res = makeRes()

    await handler(makeReq({ method: 'POST', body: { content: helloDoc } }), res)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledWith({ content: helloDoc, contentText: 'hello world' })
    expect(res.statusCode).toBe(201)
    expect(res.json).toHaveBeenCalledWith({
      _id: 'note-1',
      content: helloDoc,
      createdAt: '2026-07-01T00:00:00.000Z',
    })
  })

  it('does not create a note when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(undefined)
    const res = makeRes()

    await handler(makeReq({ method: 'POST', body: { content: helloDoc } }), res)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects a note with no content', async () => {
    const res = makeRes()

    await handler(makeReq({ method: 'POST', body: {} }), res)

    expect(mockCreate).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Note content is required.' })
  })

  it('rejects content containing an unsupported node type', async () => {
    const res = makeRes()
    const evil = { type: 'doc', content: [{ type: 'script', content: [] }] }

    await handler(makeReq({ method: 'POST', body: { content: evil } }), res)

    expect(mockCreate).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })
})
