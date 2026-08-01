import { connectDB } from '../lib/db.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { prepareBrew, type BrewBody } from '../lib/brew-entry.js'
import Brew from '../models/Brew.js'
import { requireAuth } from '../lib/vercel-auth.js'

const FIELDS =
  'bean origin roaster method dose water temperature brewSeconds rating tastingNote pairedSlug createdAt updatedAt'

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
      sendJson(res, 200, brew, meta)
      return
    }

    if (req.method === 'PUT') {
      const prepared = prepareBrew(readBody<BrewBody>(req))
      if (!prepared.ok) {
        sendJson(res, prepared.status, { error: prepared.error }, meta)
        return
      }

      const brew = await Brew.findByIdAndUpdate(
        id,
        { $set: prepared.value },
        { new: true, runValidators: true }
      )
        .select(FIELDS)
        .lean()

      if (!brew) {
        sendJson(res, 404, { error: 'Not found' }, meta)
        return
      }

      sendJson(res, 200, brew, meta)
      return
    }

    if (req.method === 'DELETE') {
      await Brew.findByIdAndDelete(id)
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
