/**
 * Local development server — NOT used on Vercel.
 * Run with: node api/server.js
 */
import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes  from './routes/auth.js'
import postsRoutes from './routes/posts.js'
import { requireAuth } from './lib/auth.js'

const app = new Hono().basePath('/api')

app.use('*', cors({
  origin: 'http://localhost:5173',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

app.route('/auth', authRoutes)
app.use('/auth/me', requireAuth)
app.route('/posts', postsRoutes)
app.get('/', (c) => c.json({ ok: true }))

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('API running at http://localhost:3001/api')
})
