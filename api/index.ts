import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handle } from 'hono/vercel'
import authRoutes from './routes/auth'
import postsRoutes from './routes/posts'
import { requireAuth, type AppBindings } from './lib/auth'
import { requestLogger } from './lib/logger'

export const config = { runtime: 'nodejs18.x' }

const app = new Hono<AppBindings>().basePath('/api')

app.use('*', requestLogger)

app.use('*', cors({
  origin: process.env.FRONTEND_URL ?? '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

app.route('/auth', authRoutes)
app.route('/posts', postsRoutes)
app.use('/auth/me', requireAuth)
app.get('/', (ctx) => ctx.json({ ok: true, version: '1.0.0' }))

export default handle(app)
