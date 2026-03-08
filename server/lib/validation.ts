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
