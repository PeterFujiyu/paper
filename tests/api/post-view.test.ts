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

import handler from '../../api/post-view.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

function makeReq(options: {
  method?: string
  body?: unknown
}): ApiRequest {
  return {
    method: options.method ?? 'POST',
    url: '/api/post-view',
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

describe('api/post-view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTrackMetricRequest.mockResolvedValue(false)
    mockVerifyHCaptcha.mockImplementation((_req: unknown, token: string) => (
      token
        ? { ok: true }
        : { ok: false, status: 403, error: 'hCaptcha verification required.' }
    ))
  })

  it('increments views without hCaptcha while the source is under the frequency threshold', async () => {
    stubFindOneAndUpdate({
      _id: 'post-1',
      viewCount: 5,
      readCompletionCount: 2,
    })
    const res = makeRes()

    await handler(makeReq({ body: { slug: 'Hello-World' } }), res)

    expect(mockTrackMetricRequest).toHaveBeenCalledWith(expect.any(Object), 'post-view', 'hello-world')
    expect(mockVerifyHCaptcha).not.toHaveBeenCalled()
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { slug: 'hello-world', published: true },
      { $inc: { viewCount: 1 } },
      { new: true }
    )
    expect(res.statusCode).toBe(200)
    expect(res.json).toHaveBeenCalledWith({
      _id: 'post-1',
      viewCount: 5,
      readCompletionCount: 2,
      readCompletionRate: 40,
    })
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

  it('increments views when a required hCaptcha token verifies successfully', async () => {
    mockTrackMetricRequest.mockResolvedValue(true)
    stubFindOneAndUpdate({
      _id: 'post-1',
      viewCount: 6,
      readCompletionCount: 2,
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
      viewCount: 6,
      readCompletionCount: 2,
      readCompletionRate: 33,
    })
  })
})
