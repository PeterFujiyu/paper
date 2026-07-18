import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
}))

vi.mock('../../server/lib/db.js', () => ({
  connectDB: mocks.connectDB,
}))

vi.mock('../../server/models/User.js', () => ({
  default: {
    findOne: mocks.findOne,
    create: mocks.create,
  },
}))

import handler from '../../api/auth-register.js'
import type { ApiRequest, ApiResponse } from '../../server/lib/logger.js'

type TestResponse = ApiResponse & {
  jsonMock: ReturnType<typeof vi.fn>
}

function makeRequest(
  ip: string,
  inviteCode: string,
  email = 'new@example.com',
): ApiRequest {
  return {
    method: 'POST',
    url: '/api/auth-register',
    headers: { 'x-forwarded-for': ip },
    body: {
      name: 'Alice Example',
      email,
      password: 'correct horse battery staple',
      inviteCode,
    },
  }
}

function makeResponse(): TestResponse {
  const jsonMock = vi.fn()

  return {
    statusCode: undefined,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: unknown) {
      jsonMock(body)
    },
    jsonMock,
    setHeader: vi.fn(),
  }
}

async function register(
  ip: string,
  inviteCode: string,
  email?: string,
): Promise<TestResponse> {
  const response = makeResponse()
  await handler(makeRequest(ip, inviteCode, email), response)
  return response
}

describe('auth-register abuse resistance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INVITE_CODE = 'correct-invite'
    mocks.connectDB.mockResolvedValue(undefined)
  })

  it('returns the same public failure for a wrong invite and an existing email', async () => {
    const wrongInvite = await register('198.51.100.10', 'wrong-invite')

    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'existing-user' }),
    })
    const existingEmail = await register(
      '198.51.100.11',
      'correct-invite',
      'existing@example.com',
    )

    expect(wrongInvite.statusCode).toBe(403)
    expect(existingEmail.statusCode).toBe(403)
    expect(wrongInvite.jsonMock).toHaveBeenCalledWith({
      error: 'Registration failed.',
    })
    expect(existingEmail.jsonMock).toHaveBeenCalledWith({
      error: 'Registration failed.',
    })
  })

  it('locks the sixth failed registration attempt from the same forwarded IP', async () => {
    const ip = '198.51.100.20'

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await register(ip, 'wrong-invite')
      expect(response.statusCode).toBe(403)
    }

    const locked = await register(ip, 'wrong-invite')

    expect(locked.statusCode).toBe(429)
    expect(locked.jsonMock).toHaveBeenCalledWith({
      error: 'Too many attempts. Try again in 15 minutes.',
    })
    expect(mocks.connectDB).toHaveBeenCalledTimes(5)
  })
})
