import Post from '../models/Post.js'

// A MongoDB duplicate-key (E11000) error raised specifically by the unique `slug`
// index. Post create/update can race a concurrent insert of the same slug; both
// routes map this to a 409 rather than a generic 500.
export function isDuplicateSlugError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: number }).code === 11000 &&
    'keyPattern' in error &&
    (error as { keyPattern?: Record<string, unknown> }).keyPattern?.slug
  )
}

// Whether any post already uses this slug. `excludeId` skips the post being
// updated so it doesn't collide with itself. Callers must ensure the DB is
// connected first.
export async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const query: Record<string, unknown> = { slug }
  if (excludeId) query._id = { $ne: excludeId }
  const existing = await Post.findOne(query).select('_id').lean()
  return !!existing
}
