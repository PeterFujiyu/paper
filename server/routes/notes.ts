import { connectDB } from '../lib/db.js'
import { setPublicReadCache } from '../lib/cache.js'
import { listNotes, MAX_CONTENT_SEARCH_LENGTH, type NoteLean } from '../lib/content-queries.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { prepareNoteContent, sanitizeStoredNoteContent } from '../lib/note-content.js'
import { requireAuth } from '../lib/vercel-auth.js'
import Note from '../models/Note.js'

// Re-sanitize each note's content before it ships to a public reader.
function forRead(notes: NoteLean[]): Array<{ _id: unknown; content: unknown; createdAt?: Date | string }> {
  return notes.map((note) => ({
    _id: note._id,
    content: sanitizeStoredNoteContent(note.content),
    createdAt: note.createdAt,
  }))
}

type NoteBody = {
  content?: unknown
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    await connectDB()

    // Reading notes is public; authoring them is admin-only.
    if (req.method === 'GET') {
      const q = getQueryParam(req, 'q').trim().slice(0, MAX_CONTENT_SEARCH_LENGTH)
      const notes = await listNotes({ q: q || undefined, limit: q ? 20 : 30 })

      setPublicReadCache(res)
      sendJson(res, 200, forRead(notes), meta)
      return
    }

    if (req.method === 'POST') {
      const user = await requireAuth(req, res, meta)
      if (!user) return

      const body = readBody<NoteBody>(req)
      const prepared = prepareNoteContent(body.content)
      if (!prepared.ok) {
        sendJson(res, prepared.status, { error: prepared.error }, meta)
        return
      }

      const note = await Note.create({
        content: prepared.content,
        contentText: prepared.contentText,
        // A person writing in the admin and pressing Save means it. Only the
        // MCP authoring tool leaves a note as a draft.
        published: true,
      })

      const created = note.toObject()
      sendJson(res, 201, { _id: created._id, content: created.content, createdAt: created.createdAt }, meta)
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' }, meta)
  } catch (error) {
    logError('[api/notes]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
