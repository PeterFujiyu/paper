import { handle } from 'hono/vercel'
import { createApp } from '../server/app.js'

export const config = {
  runtime: 'nodejs',
}

export default handle(createApp())
