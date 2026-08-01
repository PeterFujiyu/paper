import type { JSONContent } from '@tiptap/core'

import type { BrewMethod } from '../shared/brew'

export type JsonValue = JSONContent

export interface UserInfo {
  id: string
  email: string
  name: string
}

export interface AuthResponse {
  user: UserInfo
}

export interface PostMetrics {
  viewCount: number
  readCompletionCount: number
  readCompletionRate: number
}

export interface PostSummary extends PostMetrics {
  _id: string
  slug: string
  title: string
  excerpt: string
  createdAt: string
  published?: boolean
  coverImage?: string
  tags?: string[]
  /** Minutes to read, derived on write. 0 or absent means no estimate to show. */
  readingMinutes?: number
}

export interface PostDocument extends PostSummary {
  content: JsonValue | null
  author?: string
  updatedAt?: string
  /** The author's deliberate figure, if any. Admin reads only; 0 means none. */
  readingMinutesOverride?: number
}

export interface NoteSummary {
  _id: string
  content: JsonValue | null
  createdAt: string
}

export interface NoteDocument extends NoteSummary {
  updatedAt?: string
}

/** One logged cup, as the public coffee log and the admin editor both read it. */
export interface BrewSummary {
  _id: string
  bean: string
  origin: string
  roaster: string
  method: BrewMethod
  /** Recipe figures; 0 throughout means "not recorded" and renders as nothing. */
  dose: number
  water: number
  temperature: number
  brewSeconds: number
  /** 1–5, or 0 when unrated. */
  rating: number
  tastingNote: string
  /** Slug of the essay this cup was brewed alongside; empty when none. */
  pairedSlug: string
  createdAt: string
}

export interface BrewDocument extends BrewSummary {
  updatedAt?: string
}

/** Standing totals across every brew, not just the page being served. */
export interface BrewShelf {
  cups: number
  origins: number
  topMethod: string
}

export interface BrewListResponse {
  brews: BrewSummary[]
  shelf: BrewShelf
}

/**
 * The admin form's working copy. The numeric fields are nullable here and 0 on
 * the server: an empty input has to stay empty while typing rather than
 * snapping to zero.
 */
export interface BrewForm {
  bean: string
  origin: string
  roaster: string
  method: BrewMethod
  dose: number | null
  water: number | null
  temperature: number | null
  brewSeconds: number | null
  rating: number | null
  tastingNote: string
  pairedSlug: string
}

export interface PostForm {
  title: string
  slug: string
  excerpt: string
  content: JsonValue | null
  published: boolean
  coverImage: string
  tags: string[]
  /** Author override; null hands the estimate back to the server. */
  readingMinutesOverride: number | null
}
