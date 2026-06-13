export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const SLUG_VALIDATION_MESSAGE =
  'Slug must use lowercase letters, numbers, and hyphens only.'

export function normalizeSlug(value: string): string {
  return value.trim().toLowerCase()
}

export function slugify(value: string): string {
  return normalizeSlug(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function isValidSlug(value: string): boolean {
  const slug = normalizeSlug(value)
  return Boolean(slug) && SLUG_PATTERN.test(slug)
}
