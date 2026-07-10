import { createDispatcher } from '../server/lib/dispatch.js'
import { metricRoutes } from '../server/routes/index.js'

export default createDispatcher(metricRoutes)
