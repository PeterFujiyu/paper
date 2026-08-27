import { describe, expect, it } from 'vitest'
import {
  MIN_TOC_MINUTES,
  MIN_TOC_SECTIONS,
  collectHeadings,
  decorateHeadings,
  headingHash,
  sectionLinkLabel,
  shouldShowToc,
  slugifyHeading,
  type HeadingEntry,
  type HeadingLevel,
} from '../../../src/shared/headings'

function entries(...levels: HeadingLevel[]): HeadingEntry[] {
  return levels.map((level, index) => ({ id: `h-${index}`, text: `H ${index}`, level }))
}

function renderBody(html: string): HTMLElement {
  const body = document.createElement('div')
  body.className = 'post-body'
  body.innerHTML = html
  return body
}

describe('slugifyHeading', () => {
  it('reads a heading back as a lowercase hyphenated phrase', () => {
    expect(slugifyHeading('Accessibility and Motion')).toBe('accessibility-and-motion')
  })

  it('is deterministic — the same text always yields the same id', () => {
    const text = '  Type, Rhythm & Measure  '
    expect(slugifyHeading(text)).toBe(slugifyHeading(text))
    expect(slugifyHeading(text)).toBe('type-rhythm-measure')
  })

  it('drops apostrophes rather than breaking a word in two', () => {
    expect(slugifyHeading("The Reader's Eye")).toBe('the-readers-eye')
    expect(slugifyHeading('The Reader’s Eye')).toBe('the-readers-eye')
  })

  it('collapses punctuation and trims the hyphens it leaves behind', () => {
    expect(slugifyHeading('— On Endings… —')).toBe('on-endings')
    expect(slugifyHeading('Notes (2019–2024)')).toBe('notes-2019-2024')
  })

  it('keeps the letters of other scripts instead of emptying the id', () => {
    expect(slugifyHeading('可访问性 与 动效')).toBe('可访问性-与-动效')
  })

  it('returns an empty string when there is nothing to slug', () => {
    expect(slugifyHeading('···')).toBe('')
  })
})

describe('collectHeadings', () => {
  it('numbers duplicate headings from the second occurrence on', () => {
    const result = collectHeadings([
      { level: 2, text: 'Accessibility and Motion' },
      { level: 2, text: 'Accessibility and Motion' },
      { level: 3, text: 'Accessibility and Motion' },
    ])

    expect(result.map(entry => entry.id)).toEqual([
      'accessibility-and-motion',
      'accessibility-and-motion-2',
      'accessibility-and-motion-3',
    ])
  })

  it('will not let a generated id shadow a real heading of the same name', () => {
    const result = collectHeadings([
      { level: 2, text: 'Notes' },
      { level: 2, text: 'Notes 2' },
      { level: 2, text: 'Notes' },
    ])

    expect(result.map(entry => entry.id)).toEqual(['notes', 'notes-2', 'notes-3'])
  })

  it('steps around an id the rest of the page has already claimed', () => {
    const result = collectHeadings([
      { level: 2, text: 'Main' },
      { level: 2, text: 'Openings' },
    ], ['main', 'footer-settings'])

    expect(result.map(entry => entry.id)).toEqual(['main-2', 'openings'])
  })

  it('falls back to a named section when the text carries no letters', () => {
    const result = collectHeadings([
      { level: 2, text: '···' },
      { level: 2, text: '///' },
    ])

    expect(result.map(entry => entry.id)).toEqual(['section', 'section-2'])
  })

  it('preserves level and trimmed text in document order', () => {
    const result = collectHeadings([
      { level: 2, text: '  Openings  ' },
      { level: 3, text: 'A Digression' },
    ])

    expect(result).toEqual([
      { id: 'openings', text: 'Openings', level: 2 },
      { id: 'a-digression', text: 'A Digression', level: 3 },
    ])
  })
})

describe('shouldShowToc', () => {
  it('shows the contents for a long essay with enough sections', () => {
    expect(shouldShowToc(entries(2, 2, 2), MIN_TOC_MINUTES)).toBe(true)
    expect(shouldShowToc(entries(2, 3, 2, 3, 2), 12)).toBe(true)
  })

  it('hides it below the reading-time threshold', () => {
    expect(shouldShowToc(entries(2, 2, 2, 2), MIN_TOC_MINUTES - 1)).toBe(false)
  })

  it('hides it below the section threshold, however long the essay', () => {
    expect(shouldShowToc(entries(2, 2), 40)).toBe(false)
  })

  it('counts only top-level sections toward the threshold', () => {
    // Two h2s carrying subsections is still a two-part essay.
    expect(entries(2, 3, 3, 2, 3).filter(e => e.level === 2)).toHaveLength(2)
    expect(shouldShowToc(entries(2, 3, 3, 2, 3), 20)).toBe(false)
    expect(MIN_TOC_SECTIONS).toBe(3)
  })

  it('hides it when the post carries no reading estimate at all', () => {
    expect(shouldShowToc(entries(2, 2, 2), undefined)).toBe(false)
    expect(shouldShowToc(entries(2, 2, 2), 0)).toBe(false)
  })
})

describe('decorateHeadings', () => {
  it('ids h2 and h3 from their own text, leaving h1 alone', () => {
    const body = renderBody(`
      <h1>The Title</h1>
      <h2>Accessibility and Motion</h2>
      <p>Prose.</p>
      <h3>Reduced Motion</h3>
    `)

    const result = decorateHeadings(body)

    expect(result).toEqual([
      { id: 'accessibility-and-motion', text: 'Accessibility and Motion', level: 2 },
      { id: 'reduced-motion', text: 'Reduced Motion', level: 3 },
    ])
    expect(body.querySelector('h1')?.id).toBe('')
    expect(body.querySelector('h2')?.id).toBe('accessibility-and-motion')
    expect(body.querySelector('h3')?.id).toBe('reduced-motion')
  })

  it('hangs a labelled permalink off every section heading', () => {
    const body = renderBody('<h2>Accessibility and Motion</h2>')
    decorateHeadings(body)

    const anchor = body.querySelector<HTMLAnchorElement>('h2 a.head-anchor')
    expect(anchor).not.toBeNull()
    expect(anchor?.textContent).toBe('#')
    expect(anchor?.getAttribute('href')).toBe('#accessibility-and-motion')
    expect(anchor?.getAttribute('aria-label')).toBe('Link to section: Accessibility and Motion')
  })

  it('percent-encodes a non-Latin id so the link stays a valid URL', () => {
    const body = renderBody('<h2>可访问性</h2>')
    const [entry] = decorateHeadings(body)

    expect(entry.id).toBe('可访问性')
    expect(body.querySelector('a.head-anchor')?.getAttribute('href'))
      .toBe(headingHash('可访问性'))
    expect(decodeURIComponent(headingHash('可访问性').slice(1))).toBe('可访问性')
  })

  it('is idempotent — a second pass keeps the same ids and one anchor', () => {
    const body = renderBody('<h2>Accessibility and Motion</h2><h2>Accessibility and Motion</h2>')

    const first = decorateHeadings(body)
    const second = decorateHeadings(body)

    expect(second).toEqual(first)
    expect(second.map(entry => entry.text)).toEqual([
      'Accessibility and Motion',
      'Accessibility and Motion',
    ])
    expect(body.querySelectorAll('a.head-anchor')).toHaveLength(2)
  })

  it('does not take an id the surrounding page already uses', () => {
    // PostView wraps the article in <main id="main">; a section called "Main"
    // would otherwise make getElementById('main') answer with the wrapper.
    const page = document.createElement('main')
    page.id = 'main'
    const body = renderBody('<h2>Main</h2><h2>Openings</h2>')
    page.append(body)
    document.body.append(page)

    try {
      const result = decorateHeadings(body)

      expect(result.map(entry => entry.id)).toEqual(['main-2', 'openings'])
      expect(document.getElementById('main')).toBe(page)
      expect(document.getElementById('main-2')).toBe(body.querySelector('h2'))
    } finally {
      page.remove()
    }
  })

  it('keeps its own ids on a second pass over a body that is in the page', () => {
    const body = renderBody('<h2>Openings</h2><h2>Endings</h2>')
    document.body.append(body)

    try {
      const first = decorateHeadings(body)
      const second = decorateHeadings(body)

      expect(second).toEqual(first)
      expect(second.map(entry => entry.id)).toEqual(['openings', 'endings'])
    } finally {
      body.remove()
    }
  })

  it('returns nothing for a body with no sections', () => {
    expect(decorateHeadings(renderBody('<p>Just prose.</p>'))).toEqual([])
  })
})

describe('sectionLinkLabel', () => {
  it('names the section the link leads to', () => {
    expect(sectionLinkLabel('Accessibility and Motion'))
      .toBe('Link to section: Accessibility and Motion')
  })
})
