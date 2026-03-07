import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handle } from 'hono/vercel'
import authRoutes from './routes/auth.js'
import postsRoutes from './routes/posts.js'
import { requireAuth } from './lib/auth.js'

export const config = { runtime: 'nodejs18.x' }

const app = new Hono().basePath('/api')

// CORS — allow the frontend origin
app.use('*', cors({
  origin: process.env.FRONTEND_URL ?? '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

// Routes
app.route('/auth', authRoutes)
app.route('/posts', postsRoutes)

// Protected /auth/me needs auth middleware applied here
app.use('/auth/me', requireAuth)

app.get('/', (ctx) => ctx.json({ ok: true, version: '1.0.0' }))

export default handle(app)
