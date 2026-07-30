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

import handler from '../../server/routes/posts.js'
import { PUBLIC_READ_CACHE_CONTROL } from '../../server/lib/cache.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'
import { WORDS_PER_MINUTE } from '../../src/shared/reading-time.js'

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
    send: vi.fn(),
    setHeader: vi.fn(),
  }
}

function stubFind(result: unknown[]): void {
  const lean = vi.fn().mockResolvedValue(result)
  const select = vi.fn().mockReturnValue({ lean })
  const sort = vi.fn().mockReturnValue({ select })
  mockFind.mockReturnValue({ sort })
}

function stubSlugFree(): void {
  const lean = vi.fn().mockResolvedValue(null)
  const select = vi.fn().mockReturnValue({ lean })
  mockFindOne.mockReturnValue({ select })
}

function makePostReq(body: Record<string, unknown>): ApiRequest {
  return { method: 'POST', url: '/api/posts', headers: {}, body }
}

/** A body of `count` words, as Tiptap JSON. */
function bodyOfWords(count: number): unknown {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: Array.from({ length: count }, () => 'word').join(' ') }],
      },
    ],
  }
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

  it('lets the CDN hold the public post listing', async () => {
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
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', PUBLIC_READ_CACHE_CONTROL)
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

describe('api/posts reading time', () => {
  const base = {
    title: 'On Craft',
    slug: 'on-craft',
    excerpt: 'An essay about the overlooked details.',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    stubSlugFree()
    mockCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      toObject: () => ({ _id: 'post-1', ...doc, viewCount: 0, readCompletionCount: 0 }),
    }))
  })

  it('derives the estimate from the body when no override is given', async () => {
    const res = makeRes()

    await handler(makePostReq({ ...base, content: bodyOfWords(WORDS_PER_MINUTE * 7) }), res)

    expect(res.statusCode).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ readingMinutes: 7, readingMinutesOverride: 0 })
    )
  })

  it('stores the author override as both the shown figure and the recorded intent', async () => {
    const res = makeRes()

    await handler(
      makePostReq({
        ...base,
        content: bodyOfWords(WORDS_PER_MINUTE * 7),
        readingMinutesOverride: 20,
      }),
      res
    )

    expect(res.statusCode).toBe(201)
    // Both, so a later re-derive can tell a deliberate figure from an estimate.
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ readingMinutes: 20, readingMinutesOverride: 20 })
    )
  })

  it('rejects an override that is not a whole number of minutes', async () => {
    const res = makeRes()

    await handler(
      makePostReq({ ...base, content: bodyOfWords(100), readingMinutesOverride: 4.5 }),
      res
    )

    expect(res.statusCode).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('ships the estimate in the public listing projection', async () => {
    stubFind([])
    const res = makeRes()

    await handler(makeReq(), res)

    const select = mockFind.mock.results[0].value.sort.mock.results[0].value.select
    expect(select).toHaveBeenCalledWith(expect.stringContaining('readingMinutes'))
  })
})
