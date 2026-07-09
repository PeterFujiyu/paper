import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock the hCaptcha helper so the challenge step is deterministic.
const getHCaptchaToken = vi.fn<() => Promise<string | null>>()
vi.mock('../../../src/shared/hcaptcha', () => ({
  getHCaptchaToken: () => getHCaptchaToken(),
}))

import { usePostMetrics } from '../../../src/shared/usePostMetrics'

function metricsResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response
}

const sampleMetrics = { viewCount: 5, readCompletionCount: 1, readCompletionRate: 20 }

describe('usePostMetrics.recordMetric', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    getHCaptchaToken.mockReset()
  })

  it('returns metrics from a successful plain request without a challenge', async () => {
    const fetch = vi.fn().mockResolvedValue(metricsResponse(sampleMetrics))
    vi.stubGlobal('fetch', fetch)

    const { recordMetric } = usePostMetrics()
    await expect(recordMetric('post-view', 'a-post')).resolves.toEqual(sampleMetrics)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(getHCaptchaToken).not.toHaveBeenCalled()
  })

  it('solves the challenge and retries once when the server requires hCaptcha', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(metricsResponse({ requiresHCaptcha: true }, false, 403))
      .mockResolvedValueOnce(metricsResponse(sampleMetrics))
    vi.stubGlobal('fetch', fetch)
    getHCaptchaToken.mockResolvedValue('tok-123')

    const { recordMetric } = usePostMetrics()
    await expect(recordMetric('post-completion', 'a-post')).resolves.toEqual(sampleMetrics)
    expect(fetch).toHaveBeenCalledTimes(2)

    // The first attempt carries no token; the retry carries the solved one.
    const firstBody = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string)
    const retryBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string)
    expect(firstBody).toEqual({ slug: 'a-post' })
    expect(retryBody).toEqual({ slug: 'a-post', hcaptchaToken: 'tok-123' })
  })

  it('gives up with null when the challenge cannot be solved', async () => {
    const fetch = vi.fn().mockResolvedValue(metricsResponse({ requiresHCaptcha: true }, false, 403))
    vi.stubGlobal('fetch', fetch)
    getHCaptchaToken.mockResolvedValue(null)

    const { recordMetric } = usePostMetrics()
    await expect(recordMetric('post-view', 'a-post')).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1) // no retry without a token
  })

  it('returns null on a non-hCaptcha error without retrying or challenging', async () => {
    const fetch = vi.fn().mockResolvedValue(metricsResponse({ error: 'nope' }, false, 400))
    vi.stubGlobal('fetch', fetch)

    const { recordMetric } = usePostMetrics()
    await expect(recordMetric('post-view', 'a-post')).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(getHCaptchaToken).not.toHaveBeenCalled()
  })
})
