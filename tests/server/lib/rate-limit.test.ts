import { beforeEach, describe, expect, it } from 'vitest'

import {
  clientKey,
  consumeToken,
  resetRateLimits,
  trackedKeyCount,
} from '../../../server/lib/rate-limit.js'

const OPTIONS = { capacity: 3, refillPerSecond: 0.5 }
const START = 1_000_000

describe('token bucket', () => {
  beforeEach(() => {
    resetRateLimits()
  })

  it('allows a full burst and then refuses', () => {
    const verdicts = Array.from({ length: 4 }, () => consumeToken('a', OPTIONS, START))

    expect(verdicts.slice(0, 3).every((verdict) => verdict.allowed)).toBe(true)
    expect(verdicts[3]).toEqual({ allowed: false, retryAfterSeconds: 2 })
  })

  it('refills over time without ever exceeding the burst', () => {
    for (let i = 0; i < 3; i += 1) consumeToken('a', OPTIONS, START)

    // Two seconds buys exactly one token back.
    expect(consumeToken('a', OPTIONS, START + 2_000).allowed).toBe(true)
    expect(consumeToken('a', OPTIONS, START + 2_000).allowed).toBe(false)

    // An idle hour cannot bank more than the capacity.
    const afterIdle = Array.from({ length: 4 }, () => consumeToken('a', OPTIONS, START + 3_600_000))
    expect(afterIdle.map((verdict) => verdict.allowed)).toEqual([true, true, true, false])
  })

  it('meters each caller separately', () => {
    for (let i = 0; i < 3; i += 1) consumeToken('a', OPTIONS, START)

    expect(consumeToken('a', OPTIONS, START).allowed).toBe(false)
    expect(consumeToken('b', OPTIONS, START).allowed).toBe(true)
  })

  it('holds the bound under a flood of keys that never refill', () => {
    // Spend each bucket dry at the same instant, so the refill sweep can free
    // nothing and only the age-based eviction keeps the map bounded.
    const options = { capacity: 1, refillPerSecond: 0.001 }
    for (let i = 0; i < 10_200; i += 1) consumeToken(`flood-${i}`, options, START)

    expect(trackedKeyCount()).toBeLessThanOrEqual(10_000)

    // The most recent callers survive; the oldest were the ones dropped.
    expect(consumeToken('flood-10199', options, START).allowed).toBe(false)
  })

  it('keys on the client the platform reports, falling back to a shared bucket', () => {
    expect(clientKey(new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' })))
      .toBe('203.0.113.7')
    expect(clientKey(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
    expect(clientKey(new Headers())).toBe('unknown')
  })
})
