import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFindOne = vi.hoisted(() => vi.fn())
const mockFindOneAndUpdate = vi.hoisted(() => vi.fn())
const mockUpdateOne = vi.hoisted(() => vi.fn())
const mockDeleteOne = vi.hoisted(() => vi.fn())

vi.mock('../../../server/models/AuthThrottle.js', () => ({
  default: {
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
    updateOne: mockUpdateOne,
    deleteOne: mockDeleteOne,
  },
}))

import {
  checkAuthThrottle,
  clearAuthFailures,
  recordAuthFailure,
} from '../../../server/lib/auth-throttle.js'

function stubFindOne(entry: { lockedUntil: Date | null } | null): void {
  const lean = vi.fn().mockResolvedValue(entry)
  const select = vi.fn().mockReturnValue({ lean })
  mockFindOne.mockReturnValue({ select })
}

function stubRecord(record: { count: number; lockedUntil: Date | null }): void {
  const lean = vi.fn().mockResolvedValue(record)
  mockFindOneAndUpdate.mockReturnValue({ lean })
}

describe('auth throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T00:00:00.000Z'))
    vi.clearAllMocks()
    mockUpdateOne.mockResolvedValue(undefined)
    mockDeleteOne.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when there is no prior failure record', async () => {
    stubFindOne(null)
    expect(await checkAuthThrottle('login', '203.0.113.10')).toBeNull()
  })

  it('reports a lockout message while the lock is active', async () => {
    stubFindOne({ lockedUntil: new Date('2026-06-13T00:10:00.000Z') })
    const message = await checkAuthThrottle('login', '203.0.113.10')
    expect(message).toBe('Too many attempts. Try again in 10 minutes.')
    expect(mockDeleteOne).not.toHaveBeenCalled()
  })

  it('clears an elapsed lock so the counter restarts', async () => {
    stubFindOne({ lockedUntil: new Date('2026-06-12T23:50:00.000Z') })
    const message = await checkAuthThrottle('login', '203.0.113.10')
    expect(message).toBeNull()
    expect(mockDeleteOne).toHaveBeenCalledWith({ key: 'login:203.0.113.10' })
  })

  it('locks once the failure count reaches the threshold', async () => {
    stubRecord({ count: 5, lockedUntil: null })
    await recordAuthFailure('register', '203.0.113.10')

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { key: 'register:203.0.113.10' },
      expect.objectContaining({
        $inc: { count: 1 },
        $setOnInsert: { key: 'register:203.0.113.10', action: 'register', ip: '203.0.113.10' },
      }),
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { key: 'register:203.0.113.10' },
      { $set: { lockedUntil: new Date('2026-06-13T00:15:00.000Z') } }
    )
  })

  it('does not re-lock while a lock is already active', async () => {
    stubRecord({ count: 7, lockedUntil: new Date('2026-06-13T00:10:00.000Z') })
    await recordAuthFailure('login', '203.0.113.10')
    expect(mockUpdateOne).not.toHaveBeenCalled()
  })

  it('does not lock below the threshold', async () => {
    stubRecord({ count: 2, lockedUntil: null })
    await recordAuthFailure('login', '203.0.113.10')
    expect(mockUpdateOne).not.toHaveBeenCalled()
  })

  it('clears failures by deleting the row', async () => {
    await clearAuthFailures('login', '203.0.113.10')
    expect(mockDeleteOne).toHaveBeenCalledWith({ key: 'login:203.0.113.10' })
  })
})
