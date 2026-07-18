import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it } from 'vitest'

import {
  applySecurityHeaders,
  CONTENT_SECURITY_POLICY,
} from '../../server/lib/security.js'

const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
  }
})

describe('HTTP security policy', () => {
  it('applies a restrictive production header set', () => {
    process.env.NODE_ENV = 'production'
    const headers = new Map<string, string>()

    applySecurityHeaders({
      setHeader(name, value) {
        headers.set(name, value)
      },
    })

    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'")
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'")
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'")
    expect(headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY)
    expect(headers.get('Permissions-Policy')).toBe('camera=(), geolocation=(), microphone=()')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('Strict-Transport-Security'))
      .toBe('max-age=31536000; includeSubDomains; preload')
  })

  it('keeps Vercel headers aligned with the server policy', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      headers: Array<{
        source: string
        headers: Array<{ key: string; value: string }>
      }>
    }
    const globalRule = config.headers.find(rule => rule.source === '/(.*)')
    const deploymentHeaders = Object.fromEntries(
      globalRule?.headers.map(header => [header.key, header.value]) ?? [],
    )

    expect(deploymentHeaders).toMatchObject({
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
  })
})
