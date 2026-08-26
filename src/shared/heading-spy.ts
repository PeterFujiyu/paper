import { headerOffset } from './scroll'

// Scroll-spy for a rendered article's headings.
//
// A one-pixel observer band sits just below the fixed header. A heading is
// "read past" once it has crossed that line, and the section being read is the
// last heading that has. IntersectionObserver rather than a scroll handler: the
// callback fires only when a heading actually crosses the line, so nothing
// measures layout on every frame, and a section taller than the viewport keeps
// its highlight even though no heading is on screen.

/** Watch `ids` in document order. Returns a disposer; safe to call repeatedly. */
export function observeHeadings(ids: string[], onActive: (id: string) => void): () => void {
  if (!ids.length || typeof IntersectionObserver === 'undefined') return () => {}

  const passed = new Set<string>()
  let observer: IntersectionObserver | null = null
  let bandTop = 0

  function report(): void {
    let active = ''
    for (const id of ids) {
      if (passed.has(id)) active = id
    }
    onActive(active)
  }

  function handle(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const above = entry.isIntersecting || entry.boundingClientRect.top < bandTop
      if (above) passed.add(entry.target.id)
      else passed.delete(entry.target.id)
    }
    report()
  }

  // The header's padding is a fluid clamp() and the band's height follows the
  // viewport, so both are re-measured whenever the window changes size.
  function connect(): void {
    observer?.disconnect()
    bandTop = Math.min(headerOffset(), Math.max(window.innerHeight - 1, 0))
    const bandBottom = Math.max(window.innerHeight - bandTop - 1, 0)

    observer = new IntersectionObserver(handle, {
      rootMargin: `-${bandTop}px 0px -${bandBottom}px 0px`,
      threshold: 0,
    })

    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
  }

  connect()
  window.addEventListener('resize', connect)

  return () => {
    window.removeEventListener('resize', connect)
    observer?.disconnect()
    observer = null
  }
}
