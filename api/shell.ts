import { createDispatcher } from '../server/lib/dispatch.js'
import { shellRoutes } from '../server/routes/index.js'

export default createDispatcher(shellRoutes)
