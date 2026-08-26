import { prefersReducedMotion } from './motion'

/** Breathing room between the fixed header and the section it reveals. */
const HEADER_GAP = 24

/** Live-measured, because the header's padding is a fluid clamp(). */
export function headerOffset(): number {
  const header = document.querySelector('.site-header')
  return (header?.getBoundingClientRect().height ?? 0) + HEADER_GAP
}

export function scrollMotion(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}

/**
 * The element a `#id` hash points at. Decoded first: heading anchors keep the
 * letters of any script, so a non-Latin id arrives percent-encoded in the URL.
 */
export function hashElement(hash: string): HTMLElement | null {
  const raw = hash.replace(/^#/, '')
  if (!raw) return null
  let id = raw
  try {
    id = decodeURIComponent(raw)
  } catch {
    // Malformed escape — fall back to the literal hash.
  }
  return document.getElementById(id)
}

/** Scroll a `#id` target clear of the fixed header. No-op when the target is absent. */
export function scrollToHash(hash: string, behavior: ScrollBehavior = scrollMotion()): void {
  const el = hashElement(hash)
  if (!el) return

  const top = el.getBoundingClientRect().top + window.scrollY - headerOffset()
  window.scrollTo({ top: Math.max(top, 0), behavior })
}
