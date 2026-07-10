import { afterEach, describe, expect, it, vi } from 'vitest'
import { headerOffset, scrollMotion, scrollToHash } from '../../../src/shared/scroll'

const HEADER_HEIGHT = 72
const HEADER_GAP = 24

function renderPage({ sectionTop = 500 } = {}) {
  document.body.innerHTML = `
    <header class="site-header"></header>
    <main><section id="contact"></section></main>
  `
  const header = document.querySelector('.site-header') as HTMLElement
  const section = document.getElementById('contact') as HTMLElement

  header.getBoundingClientRect = () => ({ height: HEADER_HEIGHT }) as DOMRect
  section.getBoundingClientRect = () => ({ top: sectionTop }) as DOMRect
  return section
}

function stubMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
}

describe('scroll helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('clears the fixed header, measuring its live height', () => {
    renderPage()
    expect(headerOffset()).toBe(HEADER_HEIGHT + HEADER_GAP)
  })

  it('falls back to the gap alone when no header is mounted', () => {
    document.body.innerHTML = ''
    expect(headerOffset()).toBe(HEADER_GAP)
  })

  it('scrolls a hash target below the header, page offset included', () => {
    renderPage({ sectionTop: 500 })
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    vi.stubGlobal('scrollY', 200)
    stubMotion(false)

    scrollToHash('#contact')

    // 500 (viewport top) + 200 (already scrolled) - 96 (header + gap)
    expect(scrollTo).toHaveBeenCalledWith({ top: 604, behavior: 'smooth' })
  })

  it('never scrolls above the top of the page', () => {
    renderPage({ sectionTop: 10 })
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    vi.stubGlobal('scrollY', 0)
    stubMotion(false)

    scrollToHash('#contact')

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('ignores a hash with no matching section', () => {
    renderPage()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    stubMotion(false)

    scrollToHash('#nowhere')

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('drops smooth motion when the reader prefers reduced motion', () => {
    stubMotion(true)
    expect(scrollMotion()).toBe('auto')
    stubMotion(false)
    expect(scrollMotion()).toBe('smooth')
  })
})
