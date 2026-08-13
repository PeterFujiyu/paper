import Post from '../models/Post.js'

/** True for the unique-slug race reported by MongoDB. */
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

/** Check a slug before writing, optionally excluding the post being updated. */
export async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const query: Record<string, unknown> = { slug }
  if (excludeId) query._id = { $ne: excludeId }
  const existing = await Post.findOne(query).select('_id').lean()
  return !!existing
}
