import { createDispatcher } from '../server/lib/dispatch.js'
import { adminRoutes } from '../server/routes/index.js'

export default createDispatcher(adminRoutes)
