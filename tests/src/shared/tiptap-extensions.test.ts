import { describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import {
  ColumnHighlight,
  HighlightableTableCell,
  HighlightableTableHeader,
  renderContentHTML,
} from '../../../src/shared/tiptap-extensions'

function cell(type: 'tableCell' | 'tableHeader', text: string, highlight = false): JSONContent {
  return {
    type,
    ...(highlight ? { attrs: { highlight: true } } : {}),
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

/** A 2×3 table: a header row, then two body rows. */
function tableDoc(highlightSecondColumn = false): JSONContent {
  const h = highlightSecondColumn
  return {
    type: 'doc',
    content: [{
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'Task'), cell('tableHeader', 'Fable 5.1', h), cell('tableHeader', 'Opus 5')] },
        { type: 'tableRow', content: [cell('tableCell', 'Coding'), cell('tableCell', '55.8%', h), cell('tableCell', '52.3%')] },
        { type: 'tableRow', content: [cell('tableCell', 'Research'), cell('tableCell', '52.6%', h), cell('tableCell', '29.0%')] },
      ],
    }],
  }
}

function makeEditor(content: JSONContent): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Table, TableRow, HighlightableTableHeader, HighlightableTableCell, ColumnHighlight],
    content,
  })
}

/** Document position of the first text node containing `text`. */
function posOf(editor: Editor, text: string): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.isText && node.text?.includes(text)) found = pos + 1
    return found === -1
  })
  expect(found, `${text} not in doc`).toBeGreaterThan(-1)
  return found
}

/** The highlight flag of every cell, row by row. */
function highlightGrid(editor: Editor): boolean[][] {
  const table = (editor.getJSON() as JSONContent).content?.[0]
  return (table?.content ?? []).map((row: JSONContent) =>
    (row.content ?? []).map((c: JSONContent) => c.attrs?.highlight === true),
  )
}

describe('renderContentHTML table highlight', () => {
  it('marks highlighted cells with data-highlight and leaves the rest bare', () => {
    const html = renderContentHTML(tableDoc(true))
    expect(html.match(/data-highlight=""/g)?.length).toBe(3)
    expect(html).toMatch(/<th[^>]*data-highlight=""[^>]*><p>Fable 5\.1<\/p><\/th>/)
    expect(html).toMatch(/<th[^>]*><p>Task<\/p><\/th>/)
    expect(html).not.toMatch(/<th[^>]*data-highlight[^>]*><p>Task/)
  })

  it('renders an unflagged table without the attribute at all', () => {
    expect(renderContentHTML(tableDoc())).not.toContain('data-highlight')
  })
})

describe('toggleColumnHighlight', () => {
  it('flags every cell in the column under the cursor, header included', () => {
    const editor = makeEditor(tableDoc())
    editor.commands.setTextSelection(posOf(editor, '55.8%'))
    expect(editor.commands.toggleColumnHighlight()).toBe(true)
    expect(highlightGrid(editor)).toEqual([
      [false, true, false],
      [false, true, false],
      [false, true, false],
    ])
    editor.destroy()
  })

  it('clears a fully highlighted column on the second toggle', () => {
    const editor = makeEditor(tableDoc(true))
    editor.commands.setTextSelection(posOf(editor, 'Fable'))
    editor.commands.toggleColumnHighlight()
    expect(highlightGrid(editor).flat().some(Boolean)).toBe(false)
    editor.destroy()
  })

  it('completes a partly highlighted column rather than inverting it', () => {
    const editor = makeEditor(tableDoc())
    // Flag a single cell by hand, then toggle the column it sits in.
    editor.commands.setTextSelection(posOf(editor, '52.6%'))
    editor.commands.updateAttributes('tableCell', { highlight: true })
    editor.commands.setTextSelection(posOf(editor, '55.8%'))
    editor.commands.toggleColumnHighlight()
    expect(highlightGrid(editor).map((row) => row[1])).toEqual([true, true, true])
    editor.destroy()
  })

  it('does nothing outside a table', () => {
    const editor = makeEditor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Prose.' }] }] })
    editor.commands.setTextSelection(2)
    expect(editor.commands.toggleColumnHighlight()).toBe(false)
    editor.destroy()
  })
})
