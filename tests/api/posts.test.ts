import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockRequireAuth = vi.hoisted(() => vi.fn())
const mockFind = vi.hoisted(() => vi.fn())
const mockFindOne = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('../../server/lib/db.js', () => ({
  connectDB: mockConnectDB,
}))

vi.mock('../../server/lib/vercel-auth.js', () => ({
  requireAuth: mockRequireAuth,
}))

vi.mock('../../server/models/Post.js', () => ({
  default: {
    find: mockFind,
    findOne: mockFindOne,
    create: mockCreate,
  },
}))

import handler from '../../api/posts.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

function makeReq(method = 'GET'): ApiRequest {
  return {
    method,
    url: '/api/posts',
    headers: {},
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

function stubFind(result: unknown[]): void {
  const lean = vi.fn().mockResolvedValue(result)
  const select = vi.fn().mockReturnValue({ lean })
  const sort = vi.fn().mockReturnValue({ select })
  mockFind.mockReturnValue({ sort })
}

function stubSearchFind(result: unknown[]): { sort: ReturnType<typeof vi.fn> } {
  const lean = vi.fn().mockResolvedValue(result)
  const limit = vi.fn().mockReturnValue({ lean })
  const select = vi.fn().mockReturnValue({ limit })
  const sort = vi.fn().mockReturnValue({ select })
  mockFind.mockReturnValue({ sort })
  return { sort }
}

describe('api/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns fresh public post metrics without edge caching', async () => {
    stubFind([
      {
        _id: 'post-1',
        slug: 'hello-world',
        title: 'Hello',
        excerpt: 'A long enough excerpt.',
        createdAt: '2026-05-01T00:00:00.000Z',
        viewCount: 4,
        readCompletionCount: 3,
      },
    ])
    const res = makeRes()

    await handler(makeReq(), res)

    expect(mockFind).toHaveBeenCalledWith({ published: true })
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith([
      {
        _id: 'post-1',
        slug: 'hello-world',
        title: 'Hello',
        excerpt: 'A long enough excerpt.',
        createdAt: '2026-05-01T00:00:00.000Z',
        viewCount: 4,
        readCompletionCount: 3,
        readCompletionRate: 75,
      },
    ])
  })

  it('runs a case-insensitive substring search across fields when q is provided', async () => {
    const { sort } = stubSearchFind([
      {
        _id: 'post-2',
        slug: 'on-craft',
        title: 'On Craft',
        excerpt: 'An essay about the overlooked details.',
        createdAt: '2026-06-01T00:00:00.000Z',
        viewCount: 10,
        readCompletionCount: 5,
      },
    ])
    const req: ApiRequest = { method: 'GET', url: '/api/posts?q=craft', headers: {}, query: { q: 'craft' } }
    const res = makeRes()

    await handler(req, res)

    const rx = /craft/i
    expect(mockFind).toHaveBeenCalledWith({
      published: true,
      $or: [{ title: rx }, { excerpt: rx }, { tags: rx }, { contentText: rx }],
    })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith([
      {
        _id: 'post-2',
        slug: 'on-craft',
        title: 'On Craft',
        excerpt: 'An essay about the overlooked details.',
        createdAt: '2026-06-01T00:00:00.000Z',
        viewCount: 10,
        readCompletionCount: 5,
        readCompletionRate: 50,
      },
    ])
  })
})
