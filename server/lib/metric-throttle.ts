import { createHash } from 'node:crypto'

import type { ApiRequest } from './logger.js'
import MetricThrottle from '../models/MetricThrottle.js'

export type MetricAction = 'post-view' | 'post-completion'

const DEFAULT_WINDOW_SECONDS = 600
const DEFAULT_VIEW_THRESHOLD = 5
const DEFAULT_COMPLETION_THRESHOLD = 2

function firstHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getMetricThreshold(action: MetricAction): number {
  if (action === 'post-completion') {
    return readPositiveInt('HCAPTCHA_COMPLETION_THRESHOLD', DEFAULT_COMPLETION_THRESHOLD)
  }

  return readPositiveInt('HCAPTCHA_VIEW_THRESHOLD', DEFAULT_VIEW_THRESHOLD)
}

function getClientFingerprint(req: ApiRequest): string {
  const forwardedFor = firstHeaderValue(req.headers['x-forwarded-for'])
  const realIp = firstHeaderValue(req.headers['x-real-ip'])
  const userAgent = firstHeaderValue(req.headers['user-agent'])
  const ip = forwardedFor.split(',')[0]?.trim() || realIp || 'unknown'

  return createHash('sha256')
    .update(`${ip}:${userAgent || 'unknown'}`)
    .digest('hex')
    .slice(0, 32)
}

export async function trackMetricRequest(
  req: ApiRequest,
  action: MetricAction,
  slug: string
): Promise<boolean> {
  const windowSeconds = readPositiveInt('HCAPTCHA_RATE_LIMIT_WINDOW_SECONDS', DEFAULT_WINDOW_SECONDS)
  const windowMs = windowSeconds * 1000
  const now = Date.now()
  const bucket = Math.floor(now / windowMs)
  const threshold = getMetricThreshold(action)
  const fingerprint = getClientFingerprint(req)
  const key = `${action}:${slug}:${fingerprint}:${bucket}`

  const record = await MetricThrottle.findOneAndUpdate(
    { key },
    {
      $inc: { count: 1 },
      $setOnInsert: {
        key,
        action,
        slug,
        fingerprint,
        bucket,
        expiresAt: new Date(now + windowMs * 2),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()

  return (record?.count ?? 0) > threshold
}
