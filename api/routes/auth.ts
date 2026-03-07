import { Hono, type Context } from 'hono'
import { connectDB } from '../lib/db'
import { getUser, signToken, type AppBindings } from '../lib/auth'
import { getRequestMeta } from '../lib/logger'
import User from '../models/User'

type FailEntry = {
  count: number
  lockedUntil: number | null
}

type AuthBody = {
  email?: string
  password?: string
  name?: string
  inviteCode?: string
}

const auth = new Hono<AppBindings>()
const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000
const failMap = new Map<string, FailEntry>()

function getClientIP(ctx: Context<AppBindings>): string {
  return getRequestMeta(ctx).requestIp
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function validateRegisterBody(body: AuthBody): string | null {
  const name = body.name?.trim() ?? ''
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  const inviteCode = body.inviteCode?.trim() ?? ''
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!name) return 'Name is required.'
  if (name.length < 2) return 'Name must be at least 2 characters.'
  if (!inviteCode) return 'Invite code is required.'
  if (!email) return 'Email is required.'
  if (!emailPattern.test(email)) return 'Enter a valid email address.'
  if (!password) return 'Password is required.'
  if (password.length < 8) return 'Password must be at least 8 characters.'

  return null
}

function validateLoginBody(body: AuthBody): string | null {
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!email) return 'Email is required.'
  if (!emailPattern.test(email)) return 'Enter a valid email address.'
  if (!password) return 'Password is required.'
  if (password.length < 8) return 'Password must be at least 8 characters.'

  return null
}

function checkRateLimit(ip: string): string | null {
  const now = Date.now()
  const entry = failMap.get(ip)
  if (!entry) return null

  if (entry.lockedUntil && now < entry.lockedUntil) {
    const remaining = Math.ceil((entry.lockedUntil - now) / 1000 / 60)
    return `Too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`
  }

  if (entry.lockedUntil && now >= entry.lockedUntil) {
    failMap.delete(ip)
  }

  return null
}

function recordFailure(ip: string): void {
  const entry = failMap.get(ip) ?? { count: 0, lockedUntil: null }
  entry.count += 1
  if (entry.count >= MAX_FAILS) {
    entry.lockedUntil = Date.now() + LOCK_MS
  }
  failMap.set(ip, entry)
}

function clearFailures(ip: string): void {
  failMap.delete(ip)
}

auth.post('/register', async (ctx) => {
  try {
    await connectDB()
    const body = await ctx.req.json<AuthBody>()
    const validationError = validateRegisterBody(body)
    if (validationError) return ctx.json({ error: validationError }, 400)

    const email = body.email!.trim().toLowerCase()
    const password = body.password!
    const name = body.name!.trim()
    const inviteCode = body.inviteCode!.trim()

    const expected = process.env.INVITE_CODE
    if (!expected) return ctx.json({ error: 'Registration is disabled.' }, 403)
    if (!inviteCode || inviteCode !== expected) {
      return ctx.json({ error: 'Invalid invite code.' }, 403)
    }

    const exists = await User.findOne({ email }).lean()
    if (exists) return ctx.json({ error: 'Email already registered' }, 409)

    const user = await User.create({ email, password, name })
    const token = signToken({ id: String(user._id), email: user.email, name: user.name })

    return ctx.json({
      token,
      user: { id: String(user._id), email: user.email, name: user.name },
    }, 201)
  } catch (error) {
    const { requestId } = getRequestMeta(ctx)
    console.error(`[POST /auth/register] ${requestId}`, getErrorMessage(error))
    return ctx.json({ error: getErrorMessage(error) }, 500)
  }
})

auth.post('/login', async (ctx) => {
  const ip = getClientIP(ctx)
  const lockMessage = checkRateLimit(ip)
  if (lockMessage) return ctx.json({ error: lockMessage }, 429)

  try {
    await connectDB()
    const body = await ctx.req.json<AuthBody>()
    const validationError = validateLoginBody(body)
    if (validationError) return ctx.json({ error: validationError }, 400)

    const email = body.email!.trim().toLowerCase()
    const password = body.password!

    const user = await User.findOne({ email }).select('+password')
    if (!user) {
      recordFailure(ip)
      return ctx.json({ error: 'Invalid credentials' }, 401)
    }

    const ok = await user.comparePassword(password)
    if (!ok) {
      recordFailure(ip)
      return ctx.json({ error: 'Invalid credentials' }, 401)
    }

    clearFailures(ip)
    const token = signToken({ id: String(user._id), email: user.email, name: user.name })

    return ctx.json({
      token,
      user: { id: String(user._id), email: user.email, name: user.name },
    })
  } catch (error) {
    const { requestId } = getRequestMeta(ctx)
    console.error(`[POST /auth/login] ${requestId}`, getErrorMessage(error))
    return ctx.json({ error: getErrorMessage(error) }, 500)
  }
})

auth.get('/me', async (ctx) => ctx.json(getUser(ctx)))

export default auth
