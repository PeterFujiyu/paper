import { Hono } from 'hono'
import { connectDB } from '../lib/db.js'
import { signToken } from '../lib/auth.js'
import User from '../models/User.js'

const auth = new Hono()

// ─── Login rate limiter ───────────────────────────────────
// Tracks failed attempts per IP in memory.
// Resets on success; locks for LOCK_MS after MAX_FAILS failures.
const MAX_FAILS = 5
const LOCK_MS   = 15 * 60 * 1000 // 15 minutes

const failMap = new Map() // ip → { count, lockedUntil }

function getClientIP(ctx) {
  return (
    ctx.req.header('x-forwarded-for')?.split(',')[0].trim() ??
    ctx.req.header('x-real-ip') ??
    'unknown'
  )
}

function checkRateLimit(ip) {
  const now = Date.now()
  const entry = failMap.get(ip)
  if (!entry) return null // no prior failures

  if (entry.lockedUntil && now < entry.lockedUntil) {
    const remaining = Math.ceil((entry.lockedUntil - now) / 1000 / 60)
    return `Too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`
  }

  // Lock expired — clean up
  if (entry.lockedUntil && now >= entry.lockedUntil) {
    failMap.delete(ip)
  }
  return null
}

function recordFailure(ip) {
  const entry = failMap.get(ip) ?? { count: 0, lockedUntil: null }
  entry.count += 1
  if (entry.count >= MAX_FAILS) {
    entry.lockedUntil = Date.now() + LOCK_MS
  }
  failMap.set(ip, entry)
}

function clearFailures(ip) {
  failMap.delete(ip)
}

// ─── POST /api/auth/register ─────────────────────────────
auth.post('/register', async (ctx) => {
  try {
    await connectDB()
    const { email, password, name, inviteCode } = await ctx.req.json()

    // Invite code check
    const expected = process.env.INVITE_CODE
    if (!expected) {
      return ctx.json({ error: 'Registration is disabled.' }, 403)
    }
    if (!inviteCode || inviteCode !== expected) {
      return ctx.json({ error: 'Invalid invite code.' }, 403)
    }

    if (!email || !password || !name) {
      return ctx.json({ error: 'email, password and name are required' }, 400)
    }

    const exists = await User.findOne({ email })
    if (exists) return ctx.json({ error: 'Email already registered' }, 409)

    const user = await User.create({ email, password, name })
    const token = signToken({ id: user._id, email: user.email, name: user.name })
    return ctx.json({ token, user: { id: user._id, email: user.email, name: user.name } }, 201)
  } catch (e) {
    console.error('[POST /auth/register]', e.message)
    return ctx.json({ error: e.message }, 500)
  }
})

// ─── POST /api/auth/login ────────────────────────────────
auth.post('/login', async (ctx) => {
  const ip = getClientIP(ctx)

  // Rate limit check
  const lockMsg = checkRateLimit(ip)
  if (lockMsg) return ctx.json({ error: lockMsg }, 429)

  try {
    await connectDB()
    const { email, password } = await ctx.req.json()

    const user = await User.findOne({ email }).select('+password')
    if (!user) {
      recordFailure(ip)
      // Intentionally same message to avoid user enumeration
      return ctx.json({ error: 'Invalid credentials' }, 401)
    }

    const ok = await user.comparePassword(password)
    if (!ok) {
      recordFailure(ip)
      return ctx.json({ error: 'Invalid credentials' }, 401)
    }

    clearFailures(ip)
    const token = signToken({ id: user._id, email: user.email, name: user.name })
    return ctx.json({ token, user: { id: user._id, email: user.email, name: user.name } })
  } catch (e) {
    console.error('[POST /auth/login]', e.message)
    return ctx.json({ error: e.message }, 500)
  }
})

// ─── GET /api/auth/me ────────────────────────────────────
auth.get('/me', async (ctx) => {
  return ctx.json(ctx.get('user'))
})

export default auth
