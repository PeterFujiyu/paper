import { handle } from 'hono/vercel'
import { createApp } from './app'

export const config = {
  runtime: 'nodejs20.x',
}

export default handle(createApp())
