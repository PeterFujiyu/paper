import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth.js'
import postsRoutes from './routes/posts.js'
import { requireAuth, type AppBindings } from './lib/auth.js'
import { requestLogger } from './lib/logger.js'

export function createApp() {
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

  return app
}
