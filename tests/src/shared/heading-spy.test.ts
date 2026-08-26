import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeHeadings } from '../../../src/shared/heading-spy'

const HEADER_HEIGHT = 72
const HEADER_GAP = 24
const BAND_TOP = HEADER_HEIGHT + HEADER_GAP
const VIEWPORT = 900

type Fake = {
  options: IntersectionObserverInit
  observed: Element[]
  disconnected: boolean
  fire: (updates: Array<[string, boolean, number]>) => void
}

let instances: Fake[] = []
let disposers: Array<() => void> = []

/** Every spy keeps a resize listener alive, so each one is disposed after use. */
function spy(ids: string[], onActive: (id: string) => void = () => {}): () => void {
  const stop = observeHeadings(ids, onActive)
  disposers.push(stop)
  return stop
}

/**
 * A stand-in for the browser's observer: happy-dom never lays anything out, so
 * the crossings are fed in by hand as `[id, isIntersecting, viewport top]`.
 */
function installFakeObserver(): void {
  function FakeIntersectionObserver(
    callback: IntersectionObserverCallback,
    options: IntersectionObserverInit
  ): IntersectionObserver {
    const observed: Element[] = []
    const record: Fake = {
      options,
      observed,
      disconnected: false,
      fire(updates) {
        callback(updates.map(([id, isIntersecting, top]) => ({
          target: document.getElementById(id)!,
          isIntersecting,
          boundingClientRect: { top } as DOMRect,
        })) as unknown as IntersectionObserverEntry[], observer)
      },
    }
    instances.push(record)

    const observer = {
      observe: (el: Element) => { observed.push(el) },
      disconnect: () => {
        record.disconnected = true
        observed.length = 0
      },
      unobserve: () => {},
      takeRecords: () => [],
    } as unknown as IntersectionObserver

    return observer
  }

  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
}

function renderArticle(ids: string[]): void {
  document.body.innerHTML = `
    <header class="site-header"></header>
    <main>${ids.map(id => `<h2 id="${id}">${id}</h2>`).join('')}</main>
  `
  const header = document.querySelector('.site-header') as HTMLElement
  header.getBoundingClientRect = () => ({ height: HEADER_HEIGHT }) as DOMRect
}

const IDS = ['openings', 'motion', 'endings']

describe('observeHeadings', () => {
  beforeEach(() => {
    instances = []
    disposers = []
    renderArticle(IDS)
    installFakeObserver()
    vi.stubGlobal('innerHeight', VIEWPORT)
  })

  afterEach(() => {
    for (const dispose of disposers) dispose()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('watches a one-pixel band parked just below the fixed header', () => {
    spy(IDS)

    expect(instances).toHaveLength(1)
    expect(instances[0].options.rootMargin)
      .toBe(`-${BAND_TOP}px 0px -${VIEWPORT - BAND_TOP - 1}px 0px`)
    expect(instances[0].observed.map(el => el.id)).toEqual(IDS)
  })

  it('reports no section before the first heading has been reached', () => {
    const onActive = vi.fn()
    spy(IDS, onActive)

    instances[0].fire(IDS.map(id => [id, false, 500] as [string, boolean, number]))
    expect(onActive).toHaveBeenLastCalledWith('')
  })

  it('follows the reader down, one section at a time', () => {
    const onActive = vi.fn()
    spy(IDS, onActive)
    const [observer] = instances

    observer.fire([['openings', false, -10]])
    expect(onActive).toHaveBeenLastCalledWith('openings')

    observer.fire([['motion', true, BAND_TOP]])
    expect(onActive).toHaveBeenLastCalledWith('motion')

    observer.fire([['endings', false, -20]])
    expect(onActive).toHaveBeenLastCalledWith('endings')
  })

  it('hands the highlight back when the reader scrolls up again', () => {
    const onActive = vi.fn()
    spy(IDS, onActive)
    const [observer] = instances

    observer.fire([['openings', false, -10], ['motion', false, -5]])
    expect(onActive).toHaveBeenLastCalledWith('motion')

    observer.fire([['motion', false, 400]])
    expect(onActive).toHaveBeenLastCalledWith('openings')

    observer.fire([['openings', false, 300]])
    expect(onActive).toHaveBeenLastCalledWith('')
  })

  it('keeps the highlight on a section taller than the viewport', () => {
    const onActive = vi.fn()
    spy(IDS, onActive)
    const [observer] = instances

    // `motion` has scrolled far past the band and `endings` is still well below:
    // no heading is on screen, but the reader is plainly inside `motion`.
    observer.fire([['openings', false, -4000], ['motion', false, -2000], ['endings', false, 3000]])
    expect(onActive).toHaveBeenLastCalledWith('motion')
  })

  it('re-measures the band when the window resizes', () => {
    spy(IDS)
    expect(instances).toHaveLength(1)

    vi.stubGlobal('innerHeight', 600)
    window.dispatchEvent(new Event('resize'))

    expect(instances).toHaveLength(2)
    expect(instances[0].disconnected).toBe(true)
    expect(instances[1].options.rootMargin).toBe(`-${BAND_TOP}px 0px -${600 - BAND_TOP - 1}px 0px`)
  })

  it('stops observing, and stops listening, once disposed', () => {
    const stop = spy(IDS)
    stop()

    expect(instances[0].disconnected).toBe(true)
    window.dispatchEvent(new Event('resize'))
    expect(instances).toHaveLength(1)
  })

  it('does nothing at all when there are no headings to watch', () => {
    const onActive = vi.fn()
    expect(() => spy([], onActive)()).not.toThrow()
    expect(instances).toHaveLength(0)
  })

  it('degrades quietly where IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    expect(() => spy(IDS)()).not.toThrow()
  })
})
