import { getHCaptchaToken } from './hcaptcha'
import type { PostMetrics } from '../types/content'

type MetricError = {
  requiresHCaptcha?: boolean
}

export type MetricEndpoint = 'post-view' | 'post-completion'

// Post-view / read-completion reporting with the hCaptcha challenge-and-retry
// flow. A plain POST may be answered with `requiresHCaptcha`; we solve the
// invisible challenge once and retry with the token. Returns the updated metrics,
// or null when the request fails or the challenge can't be solved. Extracted from
// PostView so the retry logic is unit-testable without mounting the view.
export function usePostMetrics() {
  const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

  async function readMetricError(res: Response): Promise<MetricError> {
    try {
      return await res.json() as MetricError
    } catch {
      return {}
    }
  }

  function sendMetricRequest(endpoint: MetricEndpoint, slug: string, hcaptchaToken = ''): Promise<Response> {
    return fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        ...(hcaptchaToken ? { hcaptchaToken } : {}),
      }),
    })
  }

  async function recordMetric(endpoint: MetricEndpoint, slug: string): Promise<PostMetrics | null> {
    const res = await sendMetricRequest(endpoint, slug)
    if (res.ok) {
      return await res.json() as PostMetrics
    }

    const error = await readMetricError(res)
    if (!error.requiresHCaptcha) return null

    const token = await getHCaptchaToken()
    if (!token) return null

    const retry = await sendMetricRequest(endpoint, slug, token)
    if (!retry.ok) return null

    return await retry.json() as PostMetrics
  }

  return { recordMetric }
}
