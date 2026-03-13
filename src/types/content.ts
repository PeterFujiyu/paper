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

export interface PostSummary {
  _id: string
  slug: string
  title: string
  excerpt: string
  createdAt: string
  published?: boolean
}

export interface PostDocument extends PostSummary {
  content: JsonValue | null
  author?: string
  updatedAt?: string
}

export interface PostForm {
  title: string
  slug: string
  excerpt: string
  content: JsonValue | null
  published: boolean
}
