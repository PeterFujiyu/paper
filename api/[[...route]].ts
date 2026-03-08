import { handle } from 'hono/vercel'
import { createApp } from '../server/app'

export const config = {
  runtime: 'nodejs',
}

export default handle(createApp())
