import { handle } from 'hono/vercel'
import { createApp } from '../server/app'

export const config = {
  runtime: 'nodejs20.x',
}

export default handle(createApp())
