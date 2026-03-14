import type { JSONContent } from '@tiptap/core'

export type AuthBody = {
  email?: string
  password?: string
  name?: string
  inviteCode?: string
}

export type PostBody = {
  title?: string
  slug?: string
  excerpt?: string
  content?: unknown
  published?: boolean
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const safeRelativeUrlPattern = /^(?:\/|\.\/?|#)/
const safeDataImagePattern = /^data:image\/(?:avif|gif|jpe?g|png|webp);base64,[a-z0-9+/=]+$/i
const allowedNodeTypes = new Set([
  'blockquote',
  'bulletList',
  'codeBlock',
  'doc',
  'hardBreak',
  'heading',
  'horizontalRule',
  'image',
  'listItem',
  'orderedList',
  'paragraph',
  'table',
  'tableCell',
  'tableHeader',
  'tableRow',
  'text',
])
const allowedMarkTypes = new Set(['bold', 'code', 'italic', 'link', 'strike', 'underline'])
const containerNodeTypes = new Set([
  'blockquote',
  'bulletList',
  'codeBlock',
  'doc',
  'heading',
  'listItem',
  'orderedList',
  'paragraph',
  'table',
  'tableCell',
  'tableHeader',
  'tableRow',
])
const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype'])
const allowedNodeKeys = new Set(['attrs', 'content', 'marks', 'text', 'type'])
const allowedMarkKeys = new Set(['attrs', 'type'])
const maxContentDepth = 16
const maxNodeCount = 1500
const maxTextLength = 20000

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export function normalizeSlug(value: string): string {
  return value.trim().toLowerCase()
}

export function validateRegisterBody(body: AuthBody): string | null {
  const name = body.name?.trim() ?? ''
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  const inviteCode = body.inviteCode?.trim() ?? ''

  if (!name) return 'Name is required.'
  if (name.length < 2) return 'Name must be at least 2 characters.'
  if (!inviteCode) return 'Invite code is required.'
  if (!email) return 'Email is required.'
  if (!emailPattern.test(email)) return 'Enter a valid email address.'
  if (!password) return 'Password is required.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  return null
}

export function validateLoginBody(body: AuthBody): string | null {
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''

  if (!email) return 'Email is required.'
  if (!emailPattern.test(email)) return 'Enter a valid email address.'
  if (!password) return 'Password is required.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  return null
}

export function validatePostBody(body: PostBody): string | null {
  const title = body.title?.trim() ?? ''
  const slug = normalizeSlug(body.slug ?? '')
  const excerpt = body.excerpt?.trim() ?? ''

  if (!title) return 'Title is required.'
  if (title.length < 3) return 'Title must be at least 3 characters.'
  if (!slug) return 'Slug is required.'
  if (!slugPattern.test(slug)) return 'Slug must use lowercase letters, numbers, and hyphens only.'
  if (!excerpt) return 'Excerpt is required.'
  if (excerpt.length < 12) return 'Excerpt should be at least 12 characters.'
  if (body.content == null) return 'Body content is required.'
  if (typeof body.published !== 'undefined' && typeof body.published !== 'boolean') {
    return 'Published must be a boolean.'
  }
  return null
}

export function sanitizePostContent(content: unknown): ValidationResult<JSONContent> {
  const state = { nodeCount: 0 }
  const sanitized = sanitizeContentNode(content, 0, state)

  if (!sanitized.ok) {
    return sanitized
  }

  if (sanitized.value.type !== 'doc') {
    return { ok: false, error: 'Body content must start with a doc node.' }
  }

  return sanitized
}

function sanitizeContentNode(
  value: unknown,
  depth: number,
  state: { nodeCount: number }
): ValidationResult<JSONContent> {
  if (depth > maxContentDepth) {
    return { ok: false, error: 'Body content is nested too deeply.' }
  }

  const recordResult = toSafeRecord(value, 'content node')
  if (!recordResult.ok) {
    return recordResult
  }

  const record = recordResult.value
  const type = typeof record.type === 'string' ? record.type : ''

  if (!allowedNodeTypes.has(type)) {
    return { ok: false, error: `Unsupported content node type: ${type || 'unknown'}.` }
  }

  for (const key of Object.keys(record)) {
    if (!allowedNodeKeys.has(key)) {
      return { ok: false, error: `Unsupported field on content node: ${key}.` }
    }
  }

  state.nodeCount += 1
  if (state.nodeCount > maxNodeCount) {
    return { ok: false, error: 'Body content is too large.' }
  }

  const next: JSONContent = { type }

  if (type === 'text') {
    if (typeof record.text !== 'string') {
      return { ok: false, error: 'Text nodes must include text.' }
    }

    if (record.text.length > maxTextLength) {
      return { ok: false, error: 'A text node is too long.' }
    }

    next.text = record.text
  } else if ('text' in record) {
    return { ok: false, error: `Only text nodes can include text content.` }
  }

  if ('marks' in record) {
    if (type !== 'text') {
      return { ok: false, error: 'Only text nodes can include marks.' }
    }

    if (!Array.isArray(record.marks)) {
      return { ok: false, error: 'Marks must be an array.' }
    }

    const sanitizedMarks: JSONContent['marks'] = []

    for (const mark of record.marks) {
      const sanitizedMark = sanitizeMark(mark)
      if (!sanitizedMark.ok) {
        return sanitizedMark
      }
      sanitizedMarks.push(sanitizedMark.value)
    }

    if (sanitizedMarks.length) {
      next.marks = sanitizedMarks
    }
  }

  if ('attrs' in record) {
    const attrs = sanitizeNodeAttrs(type, record.attrs)
    if (!attrs.ok) {
      return attrs
    }
    if (attrs.value) {
      next.attrs = attrs.value
    }
  }

  if (containerNodeTypes.has(type)) {
    if ('content' in record && !Array.isArray(record.content)) {
      return { ok: false, error: `${type} nodes must include a content array.` }
    }

    next.content = []
    for (const child of Array.isArray(record.content) ? record.content : []) {
      const sanitizedChild = sanitizeContentNode(child, depth + 1, state)
      if (!sanitizedChild.ok) {
        return sanitizedChild
      }
      next.content.push(sanitizedChild.value)
    }
  } else if ('content' in record) {
    return { ok: false, error: `${type} nodes cannot include nested content.` }
  }

  return { ok: true, value: next }
}

function sanitizeMark(value: unknown): ValidationResult<NonNullable<JSONContent['marks']>[number]> {
  const recordResult = toSafeRecord(value, 'mark')
  if (!recordResult.ok) {
    return recordResult
  }

  const record = recordResult.value
  const type = typeof record.type === 'string' ? record.type : ''

  if (!allowedMarkTypes.has(type)) {
    return { ok: false, error: `Unsupported mark type: ${type || 'unknown'}.` }
  }

  for (const key of Object.keys(record)) {
    if (!allowedMarkKeys.has(key)) {
      return { ok: false, error: `Unsupported field on mark: ${key}.` }
    }
  }

  const next: NonNullable<JSONContent['marks']>[number] = { type }

  if (type === 'link') {
    const attrs = toSafeRecord(record.attrs, 'link mark attrs')
    if (!attrs.ok) {
      return attrs
    }

    const href = typeof attrs.value.href === 'string' ? attrs.value.href.trim() : ''
    if (!href || !isSafeHref(href)) {
      return { ok: false, error: 'Link URLs must use a safe protocol.' }
    }

    next.attrs = {
      href,
      ...(typeof attrs.value.title === 'string' ? { title: attrs.value.title } : {}),
    }
  } else if (typeof record.attrs !== 'undefined') {
    return { ok: false, error: `${type} marks cannot include attrs.` }
  }

  return { ok: true, value: next }
}

function sanitizeNodeAttrs(type: string, value: unknown): ValidationResult<Record<string, unknown> | null> {
  const attrsResult = toSafeRecord(value, `${type} attrs`)
  if (!attrsResult.ok) {
    return attrsResult
  }

  const attrs = attrsResult.value

  switch (type) {
    case 'heading': {
      const level = attrs.level
      const textAlign = sanitizeTextAlign(attrs.textAlign)

      if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 3) {
        return { ok: false, error: 'Headings must use levels 1 to 3.' }
      }

      return {
        ok: true,
        value: {
          level,
          ...(textAlign ? { textAlign } : {}),
        },
      }
    }

    case 'paragraph': {
      const textAlign = sanitizeTextAlign(attrs.textAlign)
      return { ok: true, value: textAlign ? { textAlign } : null }
    }

    case 'image': {
      const src = typeof attrs.src === 'string' ? attrs.src.trim() : ''
      if (!src || !isSafeImageSrc(src)) {
        return { ok: false, error: 'Images must use a safe source.' }
      }

      return {
        ok: true,
        value: {
          src,
          ...(typeof attrs.alt === 'string' ? { alt: attrs.alt } : {}),
          ...(typeof attrs.title === 'string' ? { title: attrs.title } : {}),
        },
      }
    }

    case 'tableCell':
    case 'tableHeader':
      return sanitizeTableCellAttrs(attrs)

    default:
      if (Object.keys(attrs).length > 0) {
        return { ok: false, error: `${type} nodes cannot include attrs.` }
      }
      return { ok: true, value: null }
  }
}

function sanitizeTableCellAttrs(attrs: Record<string, unknown>): ValidationResult<Record<string, unknown> | null> {
  const next: Record<string, unknown> = {}

  if (typeof attrs.colspan !== 'undefined') {
    if (!isSafePositiveInteger(attrs.colspan)) {
      return { ok: false, error: 'Table colspan must be a positive integer.' }
    }
    next.colspan = attrs.colspan
  }

  if (typeof attrs.rowspan !== 'undefined') {
    if (!isSafePositiveInteger(attrs.rowspan)) {
      return { ok: false, error: 'Table rowspan must be a positive integer.' }
    }
    next.rowspan = attrs.rowspan
  }

  if (typeof attrs.colwidth !== 'undefined') {
    if (!Array.isArray(attrs.colwidth) || attrs.colwidth.some((value) => !isSafePositiveInteger(value))) {
      return { ok: false, error: 'Table colwidth must be an array of positive integers.' }
    }
    next.colwidth = attrs.colwidth
  }

  return { ok: true, value: Object.keys(next).length ? next : null }
}

function sanitizeTextAlign(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return ['center', 'justify', 'left', 'right'].includes(value) ? value : null
}

function isSafeHref(value: string): boolean {
  if (safeRelativeUrlPattern.test(value)) return true

  try {
    const url = new URL(value)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)
  } catch {
    return false
  }
}

function isSafeImageSrc(value: string): boolean {
  if (safeDataImagePattern.test(value)) return true
  if (value.startsWith('/')) return true

  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function toSafeRecord(value: unknown, label: string): ValidationResult<Record<string, unknown>> {
  if (!isPlainObject(value)) {
    return { ok: false, error: `${label} must be an object.` }
  }

  for (const key of Object.keys(value)) {
    if (dangerousKeys.has(key)) {
      return { ok: false, error: `${label} contains an unsupported field.` }
    }
  }

  return { ok: true, value }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
