import { createDispatcher } from '../server/lib/dispatch.js'
import { authRoutes } from '../server/routes/index.js'

export default createDispatcher(authRoutes)
