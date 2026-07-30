/** Leave half of the `page` route transition. Mirrors --page-leave in src/style.css. */
export const PAGE_LEAVE_MS = 120

/** True when the OS asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
