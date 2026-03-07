/**
 * Local development server — NOT used on Vercel.
 * Run with: npm run api:dev
 */
import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth'
import postsRoutes from './routes/posts'
import { requireAuth, type AppBindings } from './lib/auth'
import { requestLogger } from './lib/logger'

const app = new Hono<AppBindings>().basePath('/api')

app.use('*', requestLogger)

app.use('*', cors({
  origin: 'http://localhost:5173',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

app.route('/auth', authRoutes)
app.use('/auth/me', requireAuth)
app.route('/posts', postsRoutes)
app.get('/', (ctx) => ctx.json({ ok: true }))

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('API running at http://localhost:3001/api')
})
