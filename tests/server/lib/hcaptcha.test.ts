import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { verifyHCaptcha } from '../../../server/lib/hcaptcha.js'
import type { ApiRequest } from '../../../server/lib/logger.js'

const fetchMock = vi.fn()

const originalEnv = {
  HCAPTCHA_SECRET: process.env.HCAPTCHA_SECRET,
  HCAPTCHA_SITEKEY: process.env.HCAPTCHA_SITEKEY,
  NODE_ENV: process.env.NODE_ENV,
}

function makeReq(): ApiRequest {
  return {
    method: 'POST',
    url: '/api/post-view',
    headers: {
      'x-forwarded-for': '203.0.113.10, 198.51.100.20',
    },
  }
}

function restoreEnv(name: keyof typeof originalEnv): void {
  const value = originalEnv[name]
  if (typeof value === 'undefined') {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

describe('hCaptcha verification', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    process.env.HCAPTCHA_SECRET = 'secret-key'
    process.env.HCAPTCHA_SITEKEY = 'site-key'
    process.env.NODE_ENV = 'production'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    restoreEnv('HCAPTCHA_SECRET')
    restoreEnv('HCAPTCHA_SITEKEY')
    restoreEnv('NODE_ENV')
  })

  it('form-encodes the hCaptcha verification request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    const result = await verifyHCaptcha(makeReq(), 'token-123')

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.hcaptcha.com/siteverify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    )

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams
    expect(body.get('secret')).toBe('secret-key')
    expect(body.get('response')).toBe('token-123')
    expect(body.get('sitekey')).toBe('site-key')
    expect(body.get('remoteip')).toBe('203.0.113.10')
  })

  it('rejects missing tokens when hCaptcha is configured', async () => {
    const result = await verifyHCaptcha(makeReq(), '')

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'hCaptcha verification required.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('bypasses hCaptcha only in local development without a secret', async () => {
    delete process.env.HCAPTCHA_SECRET
    process.env.NODE_ENV = 'development'

    const result = await verifyHCaptcha(makeReq(), '')

    expect(result).toEqual({ ok: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
