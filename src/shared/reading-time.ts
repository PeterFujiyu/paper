// Reading-time estimation, shared by the write path (which stores the estimate
// on the post) and the views (which format it). Lives here rather than in
// server/lib so the frontend can import it without reaching into server code —
// the same arrangement as src/shared/slug.ts.
//
// The estimate is computed once at write time rather than per request: the list
// page shows it too, and deriving it there would mean loading every essay's full
// body just to count its words.

/**
 * Words per minute for considered prose. Deliberately at the slower end of the
 * usual 200–250 range — this is a site of essays, not skimmable news, and an
 * estimate that runs short reads as a broken promise.
 */
export const WORDS_PER_MINUTE = 200

/** Guards the author override; also the ceiling on a computed estimate. */
export const MAX_READING_MINUTES = 999

/**
 * Minutes to read the given plain text, rounded to the nearest minute and never
 * below 1 — "0 min read" is noise, and any post at all takes a moment.
 */
export function estimateReadingMinutes(plainText: string): number {
  const words = countWords(plainText)
  if (!words) return 0
  const minutes = Math.round(words / WORDS_PER_MINUTE)
  return Math.min(Math.max(minutes, 1), MAX_READING_MINUTES)
}

/** Whitespace-delimited word count. */
export function countWords(plainText: string): number {
  const trimmed = plainText.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/** Display form, e.g. "8 min read". Empty when there is no estimate to show. */
export function formatReadingTime(minutes?: number): string {
  if (!minutes || minutes < 1) return ''
  return `${minutes} min read`
}
