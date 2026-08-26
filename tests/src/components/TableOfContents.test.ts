import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TableOfContents from '../../../src/components/TableOfContents.vue'
import type { HeadingEntry } from '../../../src/shared/headings'

const HEADINGS: HeadingEntry[] = [
  { id: 'openings', text: 'Openings', level: 2 },
  { id: 'a-digression', text: 'A Digression', level: 3 },
  { id: 'accessibility-and-motion', text: 'Accessibility and Motion', level: 2 },
  { id: 'endings', text: 'Endings', level: 2 },
]

function mountToc(props: Record<string, unknown> = {}) {
  return mount(TableOfContents, { props: { headings: HEADINGS, ...props } })
}

/** Reads v-show's own signal — a detached wrapper has no computed layout. */
function listShown(wrapper: ReturnType<typeof mountToc>): boolean {
  return (wrapper.find('.toc-list').element as HTMLElement).style.display !== 'none'
}

describe('TableOfContents markup', () => {
  it('is a labelled navigation landmark, not a bare list', () => {
    const nav = mountToc().find('nav')
    expect(nav.exists()).toBe(true)
    expect(nav.attributes('aria-label')).toBe('Table of contents')
  })

  it('lists every section in document order, as links to its hash', () => {
    const links = mountToc().findAll('.toc-link')

    expect(links.map(link => link.text())).toEqual([
      'Openings',
      'A Digression',
      'Accessibility and Motion',
      'Endings',
    ])
    expect(links.map(link => link.attributes('href'))).toEqual([
      '#openings',
      '#a-digression',
      '#accessibility-and-motion',
      '#endings',
    ])
  })

  it('keeps the heading hierarchy visible, and excludes h1 by construction', () => {
    const items = mountToc().findAll('.toc-item')

    expect(items.map(item => item.classes().find(name => name.startsWith('toc-item--')))).toEqual([
      'toc-item--h2',
      'toc-item--h3',
      'toc-item--h2',
      'toc-item--h2',
    ])
    expect(items.some(item => item.classes('toc-item--h1'))).toBe(false)
  })

  it('marks the section being read, and only that one', () => {
    const wrapper = mountToc({ activeId: 'accessibility-and-motion' })
    const current = wrapper.findAll('.toc-link--current')

    expect(current).toHaveLength(1)
    expect(current[0].text()).toBe('Accessibility and Motion')
    expect(current[0].attributes('aria-current')).toBe('true')
    expect(wrapper.find('[href="#openings"]').attributes('aria-current')).toBeUndefined()
  })

  it('emits the chosen section instead of letting the browser jump', async () => {
    const wrapper = mountToc()
    await wrapper.find('[href="#endings"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['endings']])
  })

  it('leaves a modified click to the browser, so a section can open in a new tab', async () => {
    const wrapper = mountToc()
    await wrapper.find('[href="#endings"]').trigger('click', { metaKey: true })

    expect(wrapper.emitted('select')).toBeUndefined()
  })
})

describe('TableOfContents rail variant', () => {
  it('shows its contents without a control to open', () => {
    const wrapper = mountToc({ variant: 'rail' })

    expect(wrapper.find('.toc-toggle').exists()).toBe(false)
    expect(wrapper.find('.toc-title').text()).toBe('Contents')
    expect(listShown(wrapper)).toBe(true)
  })
})

describe('TableOfContents disclosure variant', () => {
  it('starts collapsed behind a Contents button', () => {
    const wrapper = mountToc({ variant: 'disclosure' })
    const toggle = wrapper.find('.toc-toggle')

    expect(toggle.text()).toContain('Contents')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe(wrapper.find('.toc-list').attributes('id'))
    expect(listShown(wrapper)).toBe(false)
  })

  it('opens and closes on the button', async () => {
    const wrapper = mountToc({ variant: 'disclosure' })
    const toggle = wrapper.find('.toc-toggle')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(listShown(wrapper)).toBe(true)

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(listShown(wrapper)).toBe(false)
  })

  it('closes itself once a section is chosen', async () => {
    const wrapper = mountToc({ variant: 'disclosure' })
    await wrapper.find('.toc-toggle').trigger('click')
    await wrapper.find('[href="#openings"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['openings']])
    expect(wrapper.find('.toc-toggle').attributes('aria-expanded')).toBe('false')
  })
})
