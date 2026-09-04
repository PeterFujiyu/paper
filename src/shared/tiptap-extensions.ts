import { Extension, generateHTML, type Extensions, type JSONContent } from '@tiptap/core'
import { isInTable, selectedRect } from '@tiptap/pm/tables'
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

// ─── Column highlight ─────────────────────────────────────
// A table can single out one column the way a comparison table singles out the
// thing being compared. The flag lives on each cell (`highlight: true`) rather
// than on the table, so it survives row/column edits and needs no column index
// to stay in sync; the renderer turns it into a `data-highlight` attribute that
// the stylesheet tints. The sanitizer in server/lib/validation.ts admits the
// same attribute — keep the two in step.

const highlightAttribute = {
  highlight: {
    default: false,
    parseHTML: (element: HTMLElement): boolean => element.hasAttribute('data-highlight'),
    renderHTML: (attributes: Record<string, unknown>): Record<string, string> =>
      attributes.highlight ? { 'data-highlight': '' } : {},
  },
}

export const HighlightableTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...highlightAttribute }
  },
})

export const HighlightableTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...highlightAttribute }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columnHighlight: {
      /** Flag or unflag every cell in the column(s) under the selection. */
      toggleColumnHighlight: () => ReturnType
    }
  }
}

export const ColumnHighlight = Extension.create({
  name: 'columnHighlight',

  addCommands() {
    return {
      toggleColumnHighlight: () => ({ state, tr, dispatch }) => {
        if (!isInTable(state)) return false
        const { map, table, tableStart, left, right } = selectedRect(state)

        // A cell spanning several rows occupies several map slots, so collect
        // distinct positions before touching anything.
        const positions = new Set<number>()
        for (let row = 0; row < map.height; row++) {
          for (let col = left; col < right; col++) {
            positions.add(map.map[row * map.width + col])
          }
        }
        const cells = [...positions].flatMap((pos) => {
          const node = table.nodeAt(pos)
          return node ? [{ pos, node }] : []
        })
        if (cells.length === 0) return false

        // Toggle as a unit: a partly highlighted column becomes fully highlighted.
        const highlight = !cells.every(({ node }) => node.attrs.highlight === true)
        if (dispatch) {
          for (const { pos, node } of cells) {
            tr.setNodeMarkup(tableStart + pos, undefined, { ...node.attrs, highlight })
          }
        }
        return true
      },
    }
  },
})

// Read-only extension set used to render stored TipTap JSON to HTML. Kept in one
// place so article bodies and notes always render identically — if an extension is
// added here it applies to both, so they can never drift apart.
export const readOnlyExtensions: Extensions = [
  StarterKit,
  Image.configure({ allowBase64: true }),
  Table.configure({ resizable: false }),
  TableRow,
  HighlightableTableHeader,
  HighlightableTableCell,
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
