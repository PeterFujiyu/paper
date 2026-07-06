import { connectDB } from '../server/lib/db.js'
import { beginRequest, finishRequest, getQueryParam, logError, readBody, sendJson, type ApiRequest, type ApiResponse } from '../server/lib/logger.js'
import { escapeRegExp } from '../server/lib/regex.js'
import { prepareNoteContent } from '../server/lib/note-content.js'
import { requireAuth } from '../server/lib/vercel-auth.js'
import Note from '../server/models/Note.js'

type NoteBody = {
  content?: unknown
}

// Only the fields needed to render a note inline. `contentText` stays server-side
// (`select: false`); `content` is returned (unlike post lists) because notes are
// rendered in place rather than linked to a detail page.
const FIELDS = 'content createdAt'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    await connectDB()

    // Reading notes is public; authoring them is admin-only.
    if (req.method === 'GET') {
      const q = getQueryParam(req, 'q').trim()

      if (q) {
        // Case-insensitive substring search over the plain-text body. The query is
        // escaped to a literal so special characters can't break the pattern or
        // trigger ReDoS. Regex (not $text) because MongoDB text indexes are
        // rejected under this connection's Stable API `apiStrict`.
        const rx = new RegExp(escapeRegExp(q), 'i')
        const results = await Note.find({ contentText: rx })
          .sort({ createdAt: -1 })
          .select(FIELDS)
          .limit(20)
          .lean()
        res.setHeader('Cache-Control', 'no-store')
        sendJson(res, 200, results, meta)
        return
      }

      const notes = await Note.find({})
        .sort({ createdAt: -1 })
        .select(FIELDS)
        .limit(30)
        .lean()
      res.setHeader('Cache-Control', 'no-store')
      sendJson(res, 200, notes, meta)
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
