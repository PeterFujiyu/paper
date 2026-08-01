import { setPublicReadCache } from '../lib/cache.js'
import { connectDB } from '../lib/db.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { prepareBrew, type BrewBody } from '../lib/brew-entry.js'
import { escapeRegExp } from '../lib/regex.js'
import Brew from '../models/Brew.js'
import { requireAuth } from '../lib/vercel-auth.js'

// Everything a brew card renders. `searchText` is `select: false` on the schema
// and is named nowhere here — it never leaves the server.
const FIELDS =
  'bean origin roaster method dose water temperature brewSeconds rating tastingNote pairedSlug createdAt'

// Upper bound on the search query; a literal substring match needs nothing longer.
const MAX_SEARCH_LENGTH = 100

const LIST_LIMIT = 30
const SEARCH_LIMIT = 20

type MethodTally = { _id: string | null; count: number; origins: (string | null)[] }

/**
 * The standing facts about the shelf — how many cups, how many origins, which
 * method wins. Computed over every brew rather than the page being served, so
 * the strip keeps telling the truth once the list outgrows its limit.
 *
 * One grouped round trip: the output is bounded by the method vocabulary (eight
 * entries), and the totals are reduced from it here rather than in a second query.
 */
async function readShelf(): Promise<{ cups: number; origins: number; topMethod: string }> {
  const tallies = (await Brew.aggregate([
    { $group: { _id: '$method', count: { $sum: 1 }, origins: { $addToSet: '$origin' } } },
  ])) as MethodTally[]

  let cups = 0
  let topMethod = ''
  let topCount = 0
  const origins = new Set<string>()

  for (const tally of tallies) {
    cups += tally.count
    if (tally.count > topCount) {
      topCount = tally.count
      topMethod = tally._id ?? ''
    }
    for (const origin of tally.origins) {
      // Brews logged without an origin must not count as one.
      if (origin) origins.add(origin.toLowerCase())
    }
  }

  return { cups, origins: origins.size, topMethod }
}

// Reading the coffee log is public; logging a cup is admin-only. Mirrors the
// notes route, which splits the same way.
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    await connectDB()

    if (req.method === 'GET') {
      const q = getQueryParam(req, 'q').trim().slice(0, MAX_SEARCH_LENGTH)

      // Case-insensitive substring search over the plain-text projection. The
      // query is escaped to a literal so special characters can't break the
      // pattern or trigger ReDoS. Regex (not $text) because MongoDB text indexes
      // are rejected under this connection's Stable API `apiStrict`.
      const filter = q ? { searchText: new RegExp(escapeRegExp(q.toLowerCase()), 'i') } : {}

      const [brews, shelf] = await Promise.all([
        Brew.find(filter)
          .sort({ createdAt: -1 })
          .select(FIELDS)
          .limit(q ? SEARCH_LIMIT : LIST_LIMIT)
          .lean(),
        // The shelf describes the whole collection, not the current result set —
        // it stays put while a search narrows the list below it.
        readShelf(),
      ])

      setPublicReadCache(res)
      sendJson(res, 200, { brews, shelf }, meta)
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

      const brew = await Brew.create(prepared.value)
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
  for (const field of FIELDS.split(' ')) shaped[field] = brew[field]
  return shaped
}
