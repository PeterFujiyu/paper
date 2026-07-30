import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockRequireAuth = vi.hoisted(() => vi.fn())
const mockFindById = vi.hoisted(() => vi.fn())
const mockFindByIdAndUpdate = vi.hoisted(() => vi.fn())
const mockFindByIdAndDelete = vi.hoisted(() => vi.fn())

vi.mock('../../server/lib/db.js', () => ({
  connectDB: mockConnectDB,
}))

vi.mock('../../server/lib/vercel-auth.js', () => ({
  requireAuth: mockRequireAuth,
}))

vi.mock('../../server/models/Note.js', () => ({
  default: {
    findById: mockFindById,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    findByIdAndDelete: mockFindByIdAndDelete,
  },
}))

import handler from '../../server/routes/note.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

const helloDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
}

function makeReq(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: 'GET',
    url: '/api/note',
    headers: {},
    query: { id: 'note-1' },
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

describe('api/note', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  })

  it('rejects an unauthenticated request before touching the db', async () => {
    mockRequireAuth.mockResolvedValue(undefined)
    const res = makeRes()

    await handler(makeReq(), res)

    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockConnectDB).not.toHaveBeenCalled()
  })

  it('requires an id', async () => {
    const res = makeRes()

    await handler(makeReq({ query: {} }), res)

    expect(res.statusCode).toBe(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'id is required.' })
  })

  it('loads a note by id for editing', async () => {
    mockFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'note-1',
        content: helloDoc,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      }),
    })
    const res = makeRes()

    await handler(makeReq(), res)

    expect(mockFindById).toHaveBeenCalledWith('note-1')
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith({
      _id: 'note-1',
      content: helloDoc,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    })
  })

  it('updates a note from sanitized content', async () => {
    mockFindByIdAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'note-1',
        content: helloDoc,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-03T00:00:00.000Z',
      }),
    })
    const res = makeRes()

    await handler(makeReq({ method: 'PUT', body: { content: helloDoc } }), res)

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'note-1',
      { $set: { content: helloDoc, contentText: 'hello world' } },
      { new: true }
    )
    expect(res.statusCode).toBe(200)
  })

  it('rejects an update with unsafe content', async () => {
    const res = makeRes()
    const evil = { type: 'doc', content: [{ type: 'script', content: [] }] }

    await handler(makeReq({ method: 'PUT', body: { content: evil } }), res)

    expect(mockFindByIdAndUpdate).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })

  it('deletes a note', async () => {
    mockFindByIdAndDelete.mockResolvedValue({})
    const res = makeRes()

    await handler(makeReq({ method: 'DELETE' }), res)

    expect(mockFindByIdAndDelete).toHaveBeenCalledWith('note-1')
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
  })
})
