import { generateHTML, type Extensions, type JSONContent } from '@tiptap/core'
import StarterKit   from '@tiptap/starter-kit'
import Image        from '@tiptap/extension-image'
import { Table }    from '@tiptap/extension-table'
import TableRow     from '@tiptap/extension-table-row'
import TableHeader  from '@tiptap/extension-table-header'
import TableCell    from '@tiptap/extension-table-cell'
import Typography   from '@tiptap/extension-typography'
import Underline    from '@tiptap/extension-underline'
import Link         from '@tiptap/extension-link'
import TextAlign    from '@tiptap/extension-text-align'
import type { JsonValue } from '../types/content'

// Single source of truth for the TipTap node/mark schema. The editor
// (TiptapEditor.vue) builds its extensions from this too, and the server
// sanitizer's node/mark allowlist is asserted against this schema in
// tests/src/tiptap-contract.test.ts — so the three places that must agree on
// "what a document may contain" (edit, render, sanitize) can no longer drift.
// Only presentation-level options differ per caller (e.g. resizable tables in
// the editor); the set of schema-contributing extensions is identical.
export function buildContentExtensions(options: { resizableTables?: boolean } = {}): Extensions {
  return [
    StarterKit,
    Image.configure({ allowBase64: true }),
    Table.configure({ resizable: options.resizableTables ?? false }),
    TableRow,
    TableHeader,
    TableCell,
    Typography,
    Underline,
    Link.configure({ openOnClick: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ]
}

// Read-only extension set used to render stored TipTap JSON to HTML. Tables are
// non-interactive here; article bodies and notes both render through this set so
// they can never drift apart.
export const readOnlyExtensions: Extensions = buildContentExtensions()

// Render stored TipTap JSON to an HTML string. Returns '' for empty content and a
// safe fallback if the document can't be parsed.
export function renderContentHTML(content: JsonValue | null | undefined): string {
  if (!content) return ''
  try {
    return generateHTML(content as JSONContent, readOnlyExtensions)
  } catch {
    return '<p>Content unavailable.</p>'
  }
}
