import type { ApiRequest } from './logger.js'

const HCAPTCHA_VERIFY_URL = 'https://api.hcaptcha.com/siteverify'

type HCaptchaVerifyResponse = {
  success?: boolean
  'error-codes'?: string[]
}

export type HCaptchaResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

function getSecret(): string {
  return process.env.HCAPTCHA_SECRET?.trim() ?? ''
}

function getExpectedSitekey(): string {
  return (
    process.env.HCAPTCHA_SITEKEY?.trim() ??
    process.env.VITE_HCAPTCHA_SITEKEY?.trim() ??
    ''
  )
}

export function getHCaptchaToken(body: unknown): string {
  if (!body || typeof body !== 'object') return ''

  const record = body as Record<string, unknown>
  const token = record.hcaptchaToken ?? record.hCaptchaToken ?? record['h-captcha-response']
  return typeof token === 'string' ? token.trim() : ''
}

export function shouldBypassHCaptcha(): boolean {
  return process.env.NODE_ENV !== 'production' && !getSecret()
}

export async function verifyHCaptcha(req: ApiRequest, token: string): Promise<HCaptchaResult> {
  const secret = getSecret()

  if (!secret) {
    if (shouldBypassHCaptcha()) return { ok: true }
    return { ok: false, status: 503, error: 'hCaptcha is not configured.' }
  }

  if (!token) {
    return { ok: false, status: 403, error: 'hCaptcha verification required.' }
  }

  const params = new URLSearchParams({
    secret,
    response: token,
  })

  const expectedSitekey = getExpectedSitekey()
  if (expectedSitekey) {
    params.set('sitekey', expectedSitekey)
  }

  const forwardedFor = req.headers['x-forwarded-for']
  const remoteIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor
  const clientIp = remoteIp?.split(',')[0]?.trim()
  if (clientIp) {
    params.set('remoteip', clientIp)
  }

  let response: Response
  try {
    response = await fetch(HCAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
  } catch {
    return { ok: false, status: 502, error: 'hCaptcha verification unavailable.' }
  }

  if (!response.ok) {
    return { ok: false, status: 502, error: 'hCaptcha verification unavailable.' }
  }

  const data = await response.json() as HCaptchaVerifyResponse
  if (data.success) return { ok: true }

  return { ok: false, status: 403, error: 'hCaptcha verification failed.' }
}
