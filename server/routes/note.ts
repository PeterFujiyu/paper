import { connectDB } from '../lib/db.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { prepareNoteContent } from '../lib/note-content.js'
import { requireAuth } from '../lib/vercel-auth.js'
import Note from '../models/Note.js'

type NoteBody = {
  content?: unknown
}

// Single-note operations for the admin editor: load one for editing, update, or
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
      const note = await Note.findById(id).lean()
      if (!note) {
        sendJson(res, 404, { error: 'Not found' }, meta)
        return
      }
      res.setHeader('Cache-Control', 'no-store')
      sendJson(res, 200, { _id: note._id, content: note.content ?? null, createdAt: note.createdAt, updatedAt: note.updatedAt }, meta)
      return
    }

    if (req.method === 'PUT') {
      const body = readBody<NoteBody>(req)
      const prepared = prepareNoteContent(body.content)
      if (!prepared.ok) {
        sendJson(res, prepared.status, { error: prepared.error }, meta)
        return
      }

      const note = await Note.findByIdAndUpdate(
        id,
        { $set: { content: prepared.content, contentText: prepared.contentText } },
        { new: true }
      ).lean()

      if (!note) {
        sendJson(res, 404, { error: 'Not found' }, meta)
        return
      }

      sendJson(res, 200, { _id: note._id, content: note.content ?? null, createdAt: note.createdAt, updatedAt: note.updatedAt }, meta)
      return
    }

    if (req.method === 'DELETE') {
      await Note.findByIdAndDelete(id)
      sendJson(res, 200, { ok: true }, meta)
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' }, meta)
  } catch (error) {
    logError('[api/note]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
