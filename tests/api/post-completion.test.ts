import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockFindOneAndUpdate = vi.hoisted(() => vi.fn())

vi.mock('../../server/lib/db.js', () => ({
  connectDB: mockConnectDB,
}))

vi.mock('../../server/models/Post.js', () => ({
  default: {
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}))

import handler from '../../api/post-completion.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

function makeReq(options: {
  method?: string
  body?: unknown
}): ApiRequest {
  return {
    method: options.method ?? 'POST',
    url: '/api/post-completion',
    headers: {},
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

function stubFindOneAndUpdate(result: unknown): void {
  const lean = vi.fn().mockResolvedValue(result)
  const select = vi.fn().mockReturnValue({ lean })
  mockFindOneAndUpdate.mockReturnValue({ select })
}

describe('api/post-completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes the slug and increments completed reads for a published post', async () => {
    stubFindOneAndUpdate({
      _id: 'post-1',
      viewCount: 10,
      readCompletionCount: 7,
    })
    const res = makeRes()

    await handler(makeReq({ body: { slug: 'Hello-World' } }), res)

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { slug: 'hello-world', published: true },
      { $inc: { readCompletionCount: 1 } },
      { new: true }
    )
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith({
      _id: 'post-1',
      viewCount: 10,
      readCompletionCount: 7,
      readCompletionRate: 70,
    })
  })

  it('rejects requests without a slug before touching the database', async () => {
    const res = makeRes()

    await handler(makeReq({ body: {} }), res)

    expect(mockConnectDB).not.toHaveBeenCalled()
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Slug is required.' })
  })

  it('returns not found when the post is unpublished or missing', async () => {
    stubFindOneAndUpdate(null)
    const res = makeRes()

    await handler(makeReq({ body: { slug: 'draft-post' } }), res)

    expect(res.statusCode).toBe(404)
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' })
  })

  it('rejects unsupported methods', async () => {
    const res = makeRes()

    await handler(makeReq({ method: 'GET', body: { slug: 'hello-world' } }), res)

    expect(mockConnectDB).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(405)
  })
})
