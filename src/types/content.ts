import type { JSONContent } from '@tiptap/core'

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
