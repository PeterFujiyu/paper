import { connectDB } from '../lib/db.js'
import { beginRequest, finishRequest, logError, sendJson, type ApiRequest, type ApiResponse } from '../lib/logger.js'
import { sanitizeStoredNoteContent } from '../lib/note-content.js'
import { requireAuth } from '../lib/vercel-auth.js'
import Note from '../models/Note.js'

// Full note list for the admin management view. Auth-gated; returns the content
// so the list can show a preview. `contentText` stays server-side.
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const meta = beginRequest(req)

  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' }, meta)
      return
    }

    const user = await requireAuth(req, res, meta)
    if (!user) return

    await connectDB()
    // Drafts included, and flagged, so the list is where unpublished notes
    // surface — nothing else shows them.
    const notes = await Note.find()
      .sort({ createdAt: -1 })
      .select('content createdAt published')
      .lean()

    res.setHeader('Cache-Control', 'no-store')
    // Same invariant as the public list: stored TipTap JSON is re-sanitized
    // before it is returned, so legacy or tampered content never reaches the
    // preview renderer intact.
    sendJson(res, 200, notes.map((note) => ({
      ...note,
      content: sanitizeStoredNoteContent(note.content),
    })), meta)
  } catch (error) {
    logError('[api/admin-notes]', meta, error)
    sendJson(res, 500, { error: 'Request failed' }, meta)
  } finally {
    finishRequest(req, res, meta)
  }
}
