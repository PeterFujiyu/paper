import { setPublicReadCache } from '../lib/cache.js'
import { connectDB } from '../lib/db.js'
import { BREW_FIELDS, invalidateShelfCache, listBrews, MAX_CONTENT_SEARCH_LENGTH } from '../lib/content-queries.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { prepareBrew, type BrewBody } from '../lib/brew-entry.js'
import Brew from '../models/Brew.js'
import { requireAuth } from '../lib/vercel-auth.js'

const LIST_LIMIT = 30
const SEARCH_LIMIT = 20

// Reading the coffee log is public; logging a cup is admin-only. Mirrors the
// notes route, which splits the same way.
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    await connectDB()

    if (req.method === 'GET') {
      const q = getQueryParam(req, 'q').trim().slice(0, MAX_CONTENT_SEARCH_LENGTH)
      const result = await listBrews({
        q: q || undefined,
        limit: q ? SEARCH_LIMIT : LIST_LIMIT,
      })

      setPublicReadCache(res)
      sendJson(res, 200, result, meta)
      return
    }

    if (req.method === 'POST') {
      const user = await requireAuth(req, res, meta)
      if (!user) return

      const prepared = prepareBrew(readBody<BrewBody>(req))
      if (!prepared.ok) {
        sendJson(res, prepared.status, { error: prepared.error }, meta)
        return
      }

      const brew = await Brew.create({
        ...prepared.value,
        // A person logging a cup in the admin means it. Only the MCP tool
        // leaves a brew as a draft.
        published: true,
      })
      // This instance's shelf counts the cup now rather than at the next
      // expiry; other instances catch up when their own memo times out.
      invalidateShelfCache()
      const created = brew.toObject()
      sendJson(res, 201, { ...forRead(created), _id: created._id }, meta)
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' }, meta)
  } catch (error) {
    logError('[api/brews]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}

// The created document minus the server-only search projection, so a create
// answers with exactly the shape a read would return.
function forRead(brew: Record<string, unknown>): Record<string, unknown> {
  const shaped: Record<string, unknown> = {}
  for (const field of BREW_FIELDS.split(' ')) shaped[field] = brew[field]
  return shaped
}
