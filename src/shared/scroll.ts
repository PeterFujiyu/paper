/** Breathing room between the fixed header and the section it reveals. */
const HEADER_GAP = 24

/** Live-measured, because the header's padding is a fluid clamp(). */
export function headerOffset(): number {
  const header = document.querySelector('.site-header')
  return (header?.getBoundingClientRect().height ?? 0) + HEADER_GAP
}

export function scrollMotion(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/** Scroll a `#id` target clear of the fixed header. No-op when the target is absent. */
export function scrollToHash(hash: string, behavior: ScrollBehavior = scrollMotion()): void {
  const el = document.getElementById(hash.replace(/^#/, ''))
  if (!el) return

  const top = el.getBoundingClientRect().top + window.scrollY - headerOffset()
  window.scrollTo({ top: Math.max(top, 0), behavior })
}
