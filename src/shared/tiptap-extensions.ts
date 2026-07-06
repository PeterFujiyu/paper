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

// Read-only extension set used to render stored TipTap JSON to HTML. Kept in one
// place so article bodies and notes always render identically — if an extension is
// added here it applies to both, so they can never drift apart.
export const readOnlyExtensions: Extensions = [
  StarterKit,
  Image.configure({ allowBase64: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Typography,
  Underline,
  Link,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
]

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
