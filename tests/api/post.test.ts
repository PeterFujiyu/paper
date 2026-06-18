import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockRequireAuth = vi.hoisted(() => vi.fn())
const mockFindOne = vi.hoisted(() => vi.fn())
const mockFindByIdAndUpdate = vi.hoisted(() => vi.fn())

vi.mock('../../server/lib/db.js', () => ({
  connectDB: mockConnectDB,
}))

vi.mock('../../server/lib/vercel-auth.js', () => ({
  requireAuth: mockRequireAuth,
}))

vi.mock('../../server/models/Post.js', () => ({
  default: {
    findOne: mockFindOne,
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}))

import handler from '../../api/post.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

function makeReq(options: {
  method: string
  query?: Record<string, string>
  body?: unknown
  url?: string
}): ApiRequest {
  return {
    method: options.method,
    url: options.url ?? '/api/post',
    headers: {},
    query: options.query,
    body: options.body,
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

function stubFindOne(result: unknown): void {
  const lean = vi.fn().mockResolvedValue(result)
  const select = vi.fn().mockReturnValue({ lean })
  mockFindOne.mockReturnValue({ select, lean })
}

function stubFindByIdAndUpdate(result: unknown): void {
  const lean = vi.fn().mockResolvedValue(result)
  mockFindByIdAndUpdate.mockReturnValue({ lean })
}

describe('api/post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', email: 'a@b.com', name: 'Alice', tkv: 0 })
  })

  it('normalizes the public GET slug before loading a published post', async () => {
    const post = {
      _id: 'post-1',
      slug: 'hello-world',
      title: 'Hello',
      excerpt: 'A long enough excerpt.',
      published: true,
      viewCount: 8,
      readCompletionCount: 4,
      content: { type: 'doc', content: [] },
    }
    stubFindOne(post)
    const res = makeRes()

    await handler(makeReq({ method: 'GET', query: { slug: 'Hello-World' } }), res)

    expect(mockFindOne).toHaveBeenCalledWith({ slug: 'hello-world', published: true })
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith({
      ...post,
      readCompletionRate: 50,
    })
  })

  it('normalizes and trims fields before updating a post', async () => {
    stubFindOne(null)
    stubFindByIdAndUpdate({
      _id: 'post-1',
      slug: 'my-post-title',
      viewCount: 4,
      readCompletionCount: 1,
    })
    const res = makeRes()

    await handler(makeReq({
      method: 'PUT',
      query: { id: 'post-1' },
      body: {
        title: '  My Post Title  ',
        slug: 'My-Post-Title',
        excerpt: '  A brief excerpt for the post.  ',
        content: { type: 'doc', content: [] },
        published: true,
      },
    }), res)

    expect(mockFindOne).toHaveBeenCalledWith({
      slug: 'my-post-title',
      _id: { $ne: 'post-1' },
    })
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'post-1',
      {
        $set: {
          title: 'My Post Title',
          slug: 'my-post-title',
          excerpt: 'A brief excerpt for the post.',
          coverImage: '',
          tags: [],
          content: { type: 'doc', content: [] },
          published: true,
        },
      },
      { new: true, runValidators: true }
    )
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith({
      _id: 'post-1',
      slug: 'my-post-title',
      viewCount: 4,
      readCompletionCount: 1,
      readCompletionRate: 25,
    })
  })
})
