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
  checkAuthLock,
  clearAuthFailures,
  recordAuthFailure,
} from '../../../server/lib/auth-throttle.js'

// checkAuthLock -> findOne(...).select(...).lean()
function stubFindOne(record: unknown): void {
  const lean = vi.fn().mockResolvedValue(record)
  const select = vi.fn().mockReturnValue({ lean })
  mockFindOne.mockReturnValue({ select })
}

// recordAuthFailure -> findOneAndUpdate(...).select(...).lean()
function stubFindOneAndUpdate(record: unknown): void {
  const lean = vi.fn().mockResolvedValue(record)
  const select = vi.fn().mockReturnValue({ lean })
  mockFindOneAndUpdate.mockReturnValue({ select })
}

describe('auth throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T00:00:00.000Z'))
    vi.clearAllMocks()
    mockUpdateOne.mockResolvedValue({})
    mockDeleteOne.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows when there is no throttle record', async () => {
    stubFindOne(null)
    expect(await checkAuthLock('login', '203.0.113.10')).toBeNull()
    expect(mockFindOne).toHaveBeenCalledWith({ key: 'login:203.0.113.10' })
  })

  it('rejects while a lock is still in the future', async () => {
    stubFindOne({ lockedUntil: new Date('2026-06-13T00:15:00.000Z') })
    const message = await checkAuthLock('login', '203.0.113.10')
    expect(message).toContain('Too many attempts')
    expect(message).toContain('15 minutes')
    expect(mockDeleteOne).not.toHaveBeenCalled()
  })

  it('clears and allows once an expired lock has elapsed', async () => {
    stubFindOne({ lockedUntil: new Date('2026-06-12T23:45:00.000Z') })
    expect(await checkAuthLock('register', '203.0.113.10')).toBeNull()
    expect(mockDeleteOne).toHaveBeenCalledWith({ key: 'register:203.0.113.10' })
  })

  it('arms the lockout when the failure count reaches the threshold', async () => {
    stubFindOneAndUpdate({ count: 5, lockedUntil: null })
    await recordAuthFailure('login', '203.0.113.10')

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { key: 'login:203.0.113.10' },
      expect.objectContaining({
        $inc: { count: 1 },
        $setOnInsert: { key: 'login:203.0.113.10', action: 'login' },
      }),
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { key: 'login:203.0.113.10' },
      {
        $set: {
          lockedUntil: new Date('2026-06-13T00:15:00.000Z'),
          expiresAt: new Date('2026-06-13T00:15:00.000Z'),
        },
      }
    )
  })

  it('does not arm the lockout before the threshold', async () => {
    stubFindOneAndUpdate({ count: 4, lockedUntil: null })
    await recordAuthFailure('login', '203.0.113.10')
    expect(mockUpdateOne).not.toHaveBeenCalled()
  })

  it('never throws when the throttle store is unavailable', async () => {
    mockFindOne.mockImplementation(() => {
      throw new Error('db down')
    })
    mockFindOneAndUpdate.mockImplementation(() => {
      throw new Error('db down')
    })
    expect(await checkAuthLock('login', '203.0.113.10')).toBeNull()
    await expect(recordAuthFailure('login', '203.0.113.10')).resolves.toBeUndefined()
  })

  it('clears failures on success', async () => {
    await clearAuthFailures('login', '203.0.113.10')
    expect(mockDeleteOne).toHaveBeenCalledWith({ key: 'login:203.0.113.10' })
  })
})
