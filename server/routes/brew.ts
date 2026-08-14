import { connectDB } from '../lib/db.js'
import { invalidateShelfCache, isPublishedUnlessFalse } from '../lib/content-queries.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { prepareBrew, type BrewBody } from '../lib/brew-entry.js'
import Brew from '../models/Brew.js'
import { requireAuth } from '../lib/vercel-auth.js'

const FIELDS =
  'bean origin roaster method dose water temperature brewSeconds rating tastingNote pairedSlug published createdAt updatedAt'

// Single-brew operations for the admin editor: load one for editing, update, or
// delete. All require authentication — guests never reach this handler.
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    const user = await requireAuth(req, res, meta)
    if (!user) return

    const id = getQueryParam(req, 'id')
    if (!id) {
      sendJson(res, 400, { error: 'id is required.' }, meta)
      return
    }

    await connectDB()

    if (req.method === 'GET') {
      const brew = await Brew.findById(id).select(FIELDS).lean()
      if (!brew) {
        sendJson(res, 404, { error: 'Not found' }, meta)
        return
      }
      // no-store, not the shared-cache policy: this read sits behind requireAuth,
      // so a CDN copy would answer a later request without re-authorizing it, and
      // would hand the editor stale content right after a save.
      res.setHeader('Cache-Control', 'no-store')
      sendJson(res, 200, { ...brew, published: isPublishedUnlessFalse(brew.published) }, meta)
      return
    }

    if (req.method === 'PUT') {
      const body = readBody<BrewBody & { published?: unknown }>(req)
      const prepared = prepareBrew(body)
      if (!prepared.ok) {
        sendJson(res, prepared.status, { error: prepared.error }, meta)
        return
      }

      if (typeof body.published !== 'undefined' && typeof body.published !== 'boolean') {
        sendJson(res, 400, { error: 'Published must be a boolean.' }, meta)
        return
      }

      // Publication is only touched when the editor sends it, so editing a
      // recipe can never pull a cup off the log by omission.
      const brew = await Brew.findByIdAndUpdate(
        id,
        {
          $set: {
            ...prepared.value,
            ...(typeof body.published === 'boolean' ? { published: body.published } : {}),
          },
        },
        { new: true, runValidators: true }
      )
        .select(FIELDS)
        .lean()

      if (!brew) {
        sendJson(res, 404, { error: 'Not found' }, meta)
        return
      }

      // Origin, method and publication all move the shelf totals. This clears
      // only this instance's memo; elsewhere the TTL is the bound.
      invalidateShelfCache()
      sendJson(res, 200, { ...brew, published: isPublishedUnlessFalse(brew.published) }, meta)
      return
    }

    if (req.method === 'DELETE') {
      await Brew.findByIdAndDelete(id)
      invalidateShelfCache()
      sendJson(res, 200, { ok: true }, meta)
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' }, meta)
  } catch (error) {
    logError('[api/brew]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
