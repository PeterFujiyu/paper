import type { BrewMethod } from '../../src/shared/brew.js'
import Brew from '../models/Brew.js'
import Note from '../models/Note.js'
import Post from '../models/Post.js'
import { escapeRegExp } from './regex.js'

export const MAX_CONTENT_SEARCH_LENGTH = 100

export const POST_SUMMARY_FIELDS =
  'slug title excerpt coverImage tags readingMinutes createdAt viewCount readCompletionCount'

const NOTE_FIELDS = 'content createdAt'

export const BREW_FIELDS =
  'bean origin roaster method dose water temperature brewSeconds rating tastingNote pairedSlug createdAt'

type StoredDate = Date | string

export type PostSummaryLean = {
  _id?: unknown
  slug: string
  title: string
  excerpt: string
  coverImage?: string
  tags?: string[]
  readingMinutes?: number
  createdAt?: StoredDate
  viewCount?: number | null
  readCompletionCount?: number | null
}

export type PostLean = PostSummaryLean & {
  content?: unknown
  contentText?: string
  published?: boolean
  updatedAt?: StoredDate
  readingMinutesOverride?: number
  author?: unknown
}

export type NoteLean = {
  _id: unknown
  content?: unknown
  createdAt?: StoredDate
}

export type BrewLean = {
  _id?: unknown
  bean: string
  origin: string
  roaster: string
  method: BrewMethod
  dose: number
  water: number
  temperature: number
  brewSeconds: number
  rating: number
  tastingNote: string
  pairedSlug: string
  createdAt?: StoredDate
}

export type Shelf = {
  cups: number
  origins: number
  topMethod: string
}

type MethodTally = {
  _id: string | null
  count: number
  origins: (string | null)[]
}

/** Browse published essays newest-first. A non-positive limit means unbounded. */
export async function listPublishedPosts(opts: {
  tag?: string
  limit: number
}): Promise<PostSummaryLean[]> {
  const filter: { published: true; tags?: RegExp } = { published: true }
  if (opts.tag) {
    filter.tags = new RegExp(`^${escapeRegExp(opts.tag)}$`, 'i')
  }

  const query = Post.find(filter)
    .sort({ createdAt: -1 })
    .select(POST_SUMMARY_FIELDS)

  const posts = opts.limit > 0
    ? await query.limit(opts.limit).lean()
    : await query.lean()

  return posts as unknown as PostSummaryLean[]
}

/** Search published essay summaries by an escaped, literal substring. */
export async function searchPublishedPosts(q: string, limit: number): Promise<PostSummaryLean[]> {
  const rx = new RegExp(escapeRegExp(q), 'i')
  const posts = await Post.find({
    published: true,
    $or: [{ title: rx }, { excerpt: rx }, { tags: rx }, { contentText: rx }],
  })
    .sort({ createdAt: -1 })
    .select(POST_SUMMARY_FIELDS)
    .limit(limit)
    .lean()

  return posts as unknown as PostSummaryLean[]
}

/** Find one published essay, optionally including its private plain-text projection. */
export async function findPublishedPost(
  slug: string,
  opts?: { withText?: boolean }
): Promise<PostLean | null> {
  const query = Post.findOne({ slug, published: true })
  const post = opts?.withText
    ? await query.select('+contentText').lean()
    : await query.lean()

  return post as unknown as PostLean | null
}

/** List recent notes, optionally searching their server-only text projection. */
export async function listNotes(opts: { q?: string; limit: number }): Promise<NoteLean[]> {
  const filter = opts.q
    ? { contentText: new RegExp(escapeRegExp(opts.q), 'i') }
    : {}

  const notes = await Note.find(filter)
    .sort({ createdAt: -1 })
    .select(NOTE_FIELDS)
    .limit(opts.limit)
    .lean()

  return notes as unknown as NoteLean[]
}

/** List recent brews while computing shelf totals over the whole collection. */
export async function listBrews(opts: {
  q?: string
  limit: number
}): Promise<{ brews: BrewLean[]; shelf: Shelf }> {
  const filter = opts.q
    ? { searchText: new RegExp(escapeRegExp(opts.q.toLowerCase()), 'i') }
    : {}

  const [brews, shelf] = await Promise.all([
    Brew.find(filter)
      .sort({ createdAt: -1 })
      .select(BREW_FIELDS)
      .limit(opts.limit)
      .lean(),
    cachedShelf(),
  ])

  return { brews: brews as unknown as BrewLean[], shelf }
}

/**
 * The shelf groups the whole brews collection, and every caller gets the same
 * answer, so it is held for a minute instead of re-aggregating per request.
 * The window matches the CDN's `s-maxage` on the public read, so the site is no
 * staler than before; MCP is the reason this exists at all, being POST-only and
 * therefore never cached in front of the function.
 *
 * Caching the promise rather than the value also collapses concurrent misses
 * into one aggregation.
 */
const SHELF_TTL_MS = 60_000

let shelfCache: { promise: Promise<Shelf>; expiresAt: number } | null = null

function cachedShelf(): Promise<Shelf> {
  const now = Date.now()
  if (shelfCache && shelfCache.expiresAt > now) return shelfCache.promise

  const promise = readShelf()
  shelfCache = { promise, expiresAt: now + SHELF_TTL_MS }
  // A failed aggregation must not be served for the rest of the window.
  void promise.catch(() => {
    if (shelfCache?.promise === promise) shelfCache = null
  })

  return promise
}

/** Drop the memoized shelf — called after a write so the author sees their cup. */
export function invalidateShelfCache(): void {
  shelfCache = null
}

/** Standing shelf facts, intentionally computed over every brew. */
async function readShelf(): Promise<Shelf> {
  const tallies = (await Brew.aggregate([
    { $group: { _id: '$method', count: { $sum: 1 }, origins: { $addToSet: '$origin' } } },
  ])) as MethodTally[]

  let cups = 0
  let topMethod = ''
  let topCount = 0
  const origins = new Set<string>()

  for (const tally of tallies) {
    cups += tally.count
    if (tally.count > topCount) {
      topCount = tally.count
      topMethod = tally._id ?? ''
    }
    for (const origin of tally.origins) {
      if (origin) origins.add(origin.toLowerCase())
    }
  }

  return { cups, origins: origins.size, topMethod }
}
