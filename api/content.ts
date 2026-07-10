import { createDispatcher } from '../server/lib/dispatch.js'
import { contentRoutes } from '../server/routes/index.js'

export default createDispatcher(contentRoutes)
