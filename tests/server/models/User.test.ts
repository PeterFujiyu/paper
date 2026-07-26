// Exercises the real (unmocked) model: hashing is what the auth-password route
// relies on when it writes a hash through an atomic findOneAndUpdate that
// bypasses the pre-save hook. No DB connection is needed to hash.
import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'

import User from '../../../server/models/User.js'

describe('User.hashPassword', () => {
  it('produces a cost-12 bcrypt hash, matching the pre-save hook', async () => {
    const hash = await User.hashPassword('new-password')

    expect(hash).toMatch(/^\$2[aby]\$12\$/)
    expect(hash).not.toBe('new-password')
  })

  it('round-trips through comparePassword semantics', async () => {
    const hash = await User.hashPassword('new-password')

    expect(await bcrypt.compare('new-password', hash)).toBe(true)
    expect(await bcrypt.compare('other-password', hash)).toBe(false)
  })

  it('salts, so the same input yields different hashes', async () => {
    const [a, b] = await Promise.all([
      User.hashPassword('new-password'),
      User.hashPassword('new-password'),
    ])

    expect(a).not.toBe(b)
  })
})
