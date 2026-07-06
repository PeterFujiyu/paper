import { extractPlainText } from './content-text.js'
import { sanitizePostContent } from './validation.js'

export type PreparedNote =
  | { ok: true; content: unknown; contentText: string }
  | { ok: false; status: number; error: string }

// Reject notes whose serialized content exceeds this many characters. The content
// sanitizer caps node count and per-node text length, but not total bytes — this
// guards against oversized base64 images.
const MAX_CONTENT_CHARS = 1_500_000

function hasNonTextLeaf(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasNonTextLeaf)
  if (!node || typeof node !== 'object') return false
  const record = node as { type?: unknown; content?: unknown }
  if (record.type === 'image' || record.type === 'horizontalRule') return true
  return hasNonTextLeaf(record.content)
}

// A note is empty if it carries no text and no meaningful standalone node.
function isEmptyDoc(content: unknown): boolean {
  if (extractPlainText(content).length > 0) return false
  return !hasNonTextLeaf(content)
}

// Validate + sanitize a note's TipTap content for create/update. Shared by the
// notes create and note update handlers so both apply identical rules. The
// sanitizer whitelists node/mark types, restricts link hrefs and image sources,
// and caps depth/nodes — the defense against stored XSS.
export function prepareNoteContent(content: unknown): PreparedNote {
  if (content == null) {
    return { ok: false, status: 400, error: 'Note content is required.' }
  }

  if (JSON.stringify(content).length > MAX_CONTENT_CHARS) {
    return { ok: false, status: 413, error: 'Note is too large.' }
  }

  const sanitized = sanitizePostContent(content)
  if (!sanitized.ok) {
    return { ok: false, status: 400, error: sanitized.error }
  }

  if (isEmptyDoc(sanitized.value)) {
    return { ok: false, status: 400, error: 'Note cannot be empty.' }
  }

  return { ok: true, content: sanitized.value, contentText: extractPlainText(sanitized.value) }
}
