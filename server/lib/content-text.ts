import type { JSONContent } from '@tiptap/core'

// Cap the indexed text so a pathologically long essay can't bloat the
// document or the text index. Well beyond any realistic post length.
const MAX_LENGTH = 200_000

/**
 * Flatten a TipTap document into a single plain-text string for full-text
 * search indexing. Collects every text node, joined by spaces so words from
 * adjacent nodes or blocks never run together.
 */
export function extractPlainText(content: unknown): string {
  const parts: string[] = []
  collect(content, parts)
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH)
}

function collect(node: unknown, parts: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, parts)
    return
  }
  if (!node || typeof node !== 'object') return

  const record = node as JSONContent
  if (typeof record.text === 'string') parts.push(record.text)
  if (Array.isArray(record.content)) collect(record.content, parts)
}
