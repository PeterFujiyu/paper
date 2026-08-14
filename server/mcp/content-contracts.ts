import * as z from 'zod/v4'

import { BREW_METHODS } from '../../src/shared/brew.js'
import { extractPlainText } from '../lib/content-text.js'
import type {
  BrewLean,
  NoteLean,
  PostLean,
  PostSummaryLean,
} from '../lib/content-queries.js'
import { sanitizeStoredNoteContent } from '../lib/note-content.js'
import { getPostMetrics } from '../lib/post-metrics.js'
import { sanitizePostContent } from '../lib/validation.js'

export const requiredUnknownSchema = z.unknown().refine(
  (value) => value !== undefined,
  { message: 'Required' },
)

export const slugSchema = z.string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(200)

export const essaySummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  tags: z.array(z.string()),
  readingMinutes: z.number(),
  createdAt: z.string(),
  viewCount: z.number(),
  readCompletionCount: z.number(),
  readCompletionRate: z.number(),
})

export const essayListSchema = z.object({
  essays: z.array(essaySummarySchema),
  // How many came back, not how many exist — `total` read as the archive size
  // to a caller that had no way to ask for the rest. `hasMore` infers from a
  // full page, which is the honest signal available without a second count.
  returned: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})

export const essaySchema = essaySummarySchema.extend({
  updatedAt: z.string(),
  body: z.string(),
})

export const authorEssaySchema = essaySchema.extend({
  published: z.boolean(),
})

export const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
})

/** A note as the authoring tool returns it, where publication is the point. */
export const draftNoteSchema = noteSchema.extend({
  published: z.boolean(),
})

export const brewSchema = z.object({
  bean: z.string(),
  origin: z.string(),
  roaster: z.string(),
  method: z.enum(BREW_METHODS),
  dose: z.number(),
  water: z.number(),
  temperature: z.number(),
  brewSeconds: z.number(),
  rating: z.number(),
  tastingNote: z.string(),
  pairedSlug: z.string(),
  createdAt: z.string(),
})

export type EssaySummary = z.infer<typeof essaySummarySchema>
export type Essay = z.infer<typeof essaySchema>
export type AuthorEssay = z.infer<typeof authorEssaySchema>
export type NoteSummary = z.infer<typeof noteSchema>
export type DraftNote = z.infer<typeof draftNoteSchema>
export type BrewSummary = z.infer<typeof brewSchema>

export function serializeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.valueOf())) return date.toISOString()
  }
  return ''
}

export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  const document = value as { toObject?: () => unknown }
  if (typeof document.toObject === 'function') return toRecord(document.toObject())
  return value as Record<string, unknown>
}

export function shapeEssaySummary(post: PostSummaryLean): EssaySummary {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    tags: Array.isArray(post.tags) ? post.tags : [],
    readingMinutes: post.readingMinutes ?? 0,
    createdAt: serializeDate(post.createdAt),
    ...getPostMetrics(post),
  }
}

export function plainTextEssayBody(post: PostLean): string {
  if (post.contentText) return post.contentText
  const sanitized = sanitizePostContent(post.content)
  return sanitized.ok ? extractPlainText(sanitized.value) : ''
}

export function shapeEssay(post: PostLean, body = plainTextEssayBody(post)): Essay {
  return {
    ...shapeEssaySummary(post),
    updatedAt: serializeDate(post.updatedAt),
    body,
  }
}

export function shapeAuthorEssay(
  value: unknown,
  body: string,
  published: boolean,
): AuthorEssay {
  const post = toRecord(value)
  const normalized: PostLean = {
    slug: typeof post.slug === 'string' ? post.slug : '',
    title: typeof post.title === 'string' ? post.title : '',
    excerpt: typeof post.excerpt === 'string' ? post.excerpt : '',
    tags: Array.isArray(post.tags)
      ? post.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    readingMinutes: typeof post.readingMinutes === 'number' ? post.readingMinutes : 0,
    createdAt: dateValue(post.createdAt),
    updatedAt: dateValue(post.updatedAt),
    viewCount: typeof post.viewCount === 'number' ? post.viewCount : 0,
    readCompletionCount: typeof post.readCompletionCount === 'number'
      ? post.readCompletionCount
      : 0,
  }

  return { ...shapeEssay(normalized, body), published }
}

export function shapeNote(note: NoteLean, textOverride?: string): NoteSummary {
  const sanitized = textOverride === undefined
    ? sanitizeStoredNoteContent(note.content)
    : null

  return {
    id: String(note._id),
    text: textOverride ?? (sanitized ? extractPlainText(sanitized) : ''),
    createdAt: serializeDate(note.createdAt),
  }
}

export function shapeBrew(brew: BrewLean): BrewSummary {
  return {
    bean: brew.bean,
    origin: brew.origin,
    roaster: brew.roaster,
    method: brew.method,
    dose: brew.dose,
    water: brew.water,
    temperature: brew.temperature,
    brewSeconds: brew.brewSeconds,
    rating: brew.rating,
    tastingNote: brew.tastingNote,
    pairedSlug: brew.pairedSlug,
    createdAt: serializeDate(brew.createdAt),
  }
}

function dateValue(value: unknown): Date | string | undefined {
  return value instanceof Date || typeof value === 'string' ? value : undefined
}
