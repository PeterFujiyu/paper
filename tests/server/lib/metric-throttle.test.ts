import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFindOneAndUpdate = vi.hoisted(() => vi.fn())

vi.mock('../../../server/models/MetricThrottle.js', () => ({
  default: {
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}))

import { trackMetricRequest } from '../../../server/lib/metric-throttle.js'
import type { ApiRequest } from '../../../server/lib/logger.js'

const originalEnv = {
  HCAPTCHA_RATE_LIMIT_WINDOW_SECONDS: process.env.HCAPTCHA_RATE_LIMIT_WINDOW_SECONDS,
  HCAPTCHA_VIEW_THRESHOLD: process.env.HCAPTCHA_VIEW_THRESHOLD,
  HCAPTCHA_COMPLETION_THRESHOLD: process.env.HCAPTCHA_COMPLETION_THRESHOLD,
}

function makeReq(): ApiRequest {
  return {
    method: 'POST',
    url: '/api/post-view',
    headers: {
      'x-forwarded-for': '203.0.113.10',
      'user-agent': 'vitest',
    },
  }
}

function stubThrottleCount(count: number): void {
  const lean = vi.fn().mockResolvedValue({ count })
  mockFindOneAndUpdate.mockReturnValue({ lean })
}

function restoreEnv(name: keyof typeof originalEnv): void {
  const value = originalEnv[name]
  if (typeof value === 'undefined') {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

describe('metric throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T00:00:00.000Z'))
    vi.clearAllMocks()
    process.env.HCAPTCHA_RATE_LIMIT_WINDOW_SECONDS = '30'
    process.env.HCAPTCHA_VIEW_THRESHOLD = '1'
    process.env.HCAPTCHA_COMPLETION_THRESHOLD = '3'
  })

  afterEach(() => {
    vi.useRealTimers()
    restoreEnv('HCAPTCHA_RATE_LIMIT_WINDOW_SECONDS')
    restoreEnv('HCAPTCHA_VIEW_THRESHOLD')
    restoreEnv('HCAPTCHA_COMPLETION_THRESHOLD')
  })

  it('requires hCaptcha after the env-configured view threshold is exceeded', async () => {
    stubThrottleCount(2)

    const requiresCaptcha = await trackMetricRequest(makeReq(), 'post-view', 'hello-world')

    expect(requiresCaptcha).toBe(true)
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining('post-view:hello-world:'),
      }),
      expect.objectContaining({
        $inc: { count: 1 },
        $setOnInsert: expect.objectContaining({
          action: 'post-view',
          slug: 'hello-world',
          expiresAt: new Date('2026-06-13T00:01:00.000Z'),
        }),
      }),
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  })

  it('uses a separate env-configured threshold for completed reads', async () => {
    stubThrottleCount(3)

    const requiresCaptcha = await trackMetricRequest(makeReq(), 'post-completion', 'hello-world')

    expect(requiresCaptcha).toBe(false)
  })
})
