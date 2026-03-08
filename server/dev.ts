/**
 * Local development server — NOT used on Vercel.
 * Run with: npm run api:dev
 */
import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'

const app = createApp()

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('API running at http://localhost:3001/api')
})
