import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockTrackMetricRequest = vi.hoisted(() => vi.fn())
const mockVerifyHCaptcha = vi.hoisted(() => vi.fn())
const mockFindOneAndUpdate = vi.hoisted(() => vi.fn())

vi.mock('../../server/lib/db.js', () => ({
  connectDB: mockConnectDB,
}))

vi.mock('../../server/lib/metric-throttle.js', () => ({
  trackMetricRequest: mockTrackMetricRequest,
}))

vi.mock('../../server/lib/hcaptcha.js', () => ({
  getHCaptchaToken(body: unknown) {
    if (!body || typeof body !== 'object') return ''
    const record = body as Record<string, unknown>
    const token = record.hcaptchaToken ?? record.hCaptchaToken ?? record['h-captcha-response']
    return typeof token === 'string' ? token.trim() : ''
  },
  verifyHCaptcha: mockVerifyHCaptcha,
}))

vi.mock('../../server/models/Post.js', () => ({
  default: {
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}))

import handler from '../../server/routes/post-completion.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

function makeReq(options: {
  method?: string
  body?: unknown
}): ApiRequest {
  return {
    method: options.method ?? 'POST',
    url: '/api/post-completion',
    headers: {
      'x-forwarded-for': '203.0.113.10',
      'user-agent': 'vitest',
    },
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
    mockTrackMetricRequest.mockResolvedValue(false)
    mockVerifyHCaptcha.mockImplementation((_req: unknown, token: string) => (
      token
        ? { ok: true }
        : { ok: false, status: 403, error: 'hCaptcha verification required.' }
    ))
  })

  it('normalizes the slug and increments completed reads while the source is under the frequency threshold', async () => {
    stubFindOneAndUpdate({
      _id: 'post-1',
      viewCount: 10,
      readCompletionCount: 7,
    })
    const res = makeRes()

    await handler(makeReq({ body: { slug: 'Hello-World' } }), res)

    expect(mockTrackMetricRequest).toHaveBeenCalledWith(expect.any(Object), 'post-completion', 'hello-world')
    expect(mockVerifyHCaptcha).not.toHaveBeenCalled()
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

  it('requires hCaptcha before incrementing when the source exceeds the frequency threshold', async () => {
    mockTrackMetricRequest.mockResolvedValue(true)
    const res = makeRes()

    await handler(makeReq({ body: { slug: 'hello-world' } }), res)

    expect(mockFindOneAndUpdate).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.json).toHaveBeenCalledWith({
      error: 'hCaptcha verification required.',
      requiresHCaptcha: true,
    })
  })

  it('increments completed reads when a required hCaptcha token verifies successfully', async () => {
    mockTrackMetricRequest.mockResolvedValue(true)
    stubFindOneAndUpdate({
      _id: 'post-1',
      viewCount: 10,
      readCompletionCount: 8,
    })
    const res = makeRes()

    await handler(makeReq({
      body: {
        slug: 'hello-world',
        hcaptchaToken: 'valid-token',
      },
    }), res)

    expect(mockVerifyHCaptcha).toHaveBeenCalledWith(expect.any(Object), 'valid-token')
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith({
      _id: 'post-1',
      viewCount: 10,
      readCompletionCount: 8,
      readCompletionRate: 80,
    })
  })

  it('rejects unsupported methods', async () => {
    const res = makeRes()

    await handler(makeReq({ method: 'GET', body: { slug: 'hello-world' } }), res)

    expect(mockConnectDB).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(405)
  })
})
