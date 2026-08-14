import { isPublishedUnlessFalse } from '../lib/content-queries.js'
import { connectDB } from '../lib/db.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { prepareNoteContent, sanitizeStoredNoteContent } from '../lib/note-content.js'
import { requireAuth } from '../lib/vercel-auth.js'
import Note from '../models/Note.js'

type NoteBody = {
  content?: unknown
  published?: unknown
}

// Single-note operations for the admin editor: load one for editing, update, or
// delete. All require authentication — guests never reach this handler.
//
// Content is re-sanitized on the way out, exactly as the public list does it:
// the invariant is that stored TipTap JSON is cleaned before it is returned, and
// an admin read is where legacy or tampered content would otherwise reach a
// renderer intact.
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
      // no-store, not the shared-cache policy: this read sits behind requireAuth,
      // so a CDN copy would answer a later request without re-authorizing it, and
      // would hand the editor stale content right after a save.
      res.setHeader('Cache-Control', 'no-store')
      sendJson(res, 200, { _id: note._id, content: sanitizeStoredNoteContent(note.content), createdAt: note.createdAt, updatedAt: note.updatedAt, published: isPublishedUnlessFalse(note.published) }, meta)
      return
    }

    if (req.method === 'PUT') {
      const body = readBody<NoteBody>(req)
      const prepared = prepareNoteContent(body.content)
      if (!prepared.ok) {
        sendJson(res, prepared.status, { error: prepared.error }, meta)
        return
      }

      if (typeof body.published !== 'undefined' && typeof body.published !== 'boolean') {
        sendJson(res, 400, { error: 'Published must be a boolean.' }, meta)
        return
      }

      // Publication is only touched when the editor sends it, so a plain
      // content save can never take a note off the site by omission.
      const note = await Note.findByIdAndUpdate(
        id,
        {
          $set: {
            content: prepared.content,
            contentText: prepared.contentText,
            ...(typeof body.published === 'boolean' ? { published: body.published } : {}),
          },
        },
        { new: true, runValidators: true }
      ).lean()

      if (!note) {
        sendJson(res, 404, { error: 'Not found' }, meta)
        return
      }

      sendJson(res, 200, { _id: note._id, content: sanitizeStoredNoteContent(note.content), createdAt: note.createdAt, updatedAt: note.updatedAt, published: isPublishedUnlessFalse(note.published) }, meta)
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
