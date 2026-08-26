import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const push = vi.fn(() => Promise.resolve())
const route = { path: '/writing/an-essay', query: {}, hash: '' }

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: [String, Object], default: '' } },
    setup: (_, { slots }) => () => h('a', slots.default?.()),
  }),
  useRoute: () => route,
  useRouter: () => ({ push }),
}))

import PostView from '../../../src/views/PostView.vue'
import { MIN_TOC_MINUTES } from '../../../src/shared/headings'

/** A TipTap document whose h2 headings read as the given titles. */
function essayContent(titles: string[]) {
  return {
    type: 'doc',
    content: titles.flatMap(title => [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: title }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Prose under the section.' }] },
    ]),
  }
}

function samplePost(overrides: Record<string, unknown> = {}) {
  return {
    _id: '1',
    slug: 'an-essay',
    title: 'An Essay',
    excerpt: 'A brief excerpt.',
    createdAt: new Date('2026-01-01').toISOString(),
    viewCount: 10,
    readCompletionCount: 2,
    readCompletionRate: 0.2,
    readingMinutes: MIN_TOC_MINUTES + 2,
    content: essayContent(['Openings', 'Accessibility and Motion', 'Endings']),
    ...overrides,
  }
}

function stubFetch(post: unknown) {
  return vi.fn((input: string) => {
    const url = String(input)
    if (url.includes('/posts')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    if (url.includes('/post?')) return Promise.resolve({ ok: true, json: () => Promise.resolve(post) })
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

async function mountPost(post: unknown) {
  vi.stubGlobal('fetch', stubFetch(post))
  const wrapper = mount(PostView, { props: { slug: 'an-essay' } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('PostView section anchors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    push.mockClear()
    route.hash = ''
    document.body.innerHTML = ''
  })

  it('gives every section a stable id derived from its own text', async () => {
    const wrapper = await mountPost(samplePost())
    const ids = wrapper.findAll('.post-body h2').map(el => el.attributes('id'))

    expect(ids).toEqual(['openings', 'accessibility-and-motion', 'endings'])
  })

  it('hangs a labelled permalink off each section heading', async () => {
    const wrapper = await mountPost(samplePost())
    const anchors = wrapper.findAll('.post-body h2 a.head-anchor')

    expect(anchors).toHaveLength(3)
    expect(anchors[1].attributes('href')).toBe('#accessibility-and-motion')
    expect(anchors[1].attributes('aria-label'))
      .toBe('Link to section: Accessibility and Motion')
  })

  it('routes a permalink click to the section hash instead of jumping', async () => {
    const wrapper = await mountPost(samplePost())
    await wrapper.find('.post-body h2 a.head-anchor').trigger('click')

    expect(push).toHaveBeenCalledWith({
      path: '/writing/an-essay',
      query: {},
      hash: '#openings',
    })
  })

  it('leaves a modified permalink click to the browser', async () => {
    const wrapper = await mountPost(samplePost())
    await wrapper.find('.post-body h2 a.head-anchor').trigger('click', { metaKey: true })

    expect(push).not.toHaveBeenCalled()
  })
})

describe('PostView table of contents', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    push.mockClear()
    route.hash = ''
    document.body.innerHTML = ''
  })

  it('offers the contents on a long essay with enough sections', async () => {
    const wrapper = await mountPost(samplePost())
    const toc = wrapper.find('nav[aria-label="Table of contents"]')

    expect(toc.exists()).toBe(true)
    expect(toc.findAll('.toc-link').map(link => link.text()))
      .toEqual(['Openings', 'Accessibility and Motion', 'Endings'])
  })

  it('withholds it from a short essay', async () => {
    const wrapper = await mountPost(samplePost({ readingMinutes: MIN_TOC_MINUTES - 1 }))

    expect(wrapper.find('nav[aria-label="Table of contents"]').exists()).toBe(false)
    // The anchors are not conditional — every section stays linkable.
    expect(wrapper.findAll('.post-body h2 a.head-anchor')).toHaveLength(3)
  })

  it('withholds it from a long essay with too few sections', async () => {
    const wrapper = await mountPost(samplePost({
      content: essayContent(['Openings', 'Endings']),
      readingMinutes: 20,
    }))

    expect(wrapper.find('nav[aria-label="Table of contents"]').exists()).toBe(false)
  })

  it('collapses into a disclosure on a narrow viewport', async () => {
    const wrapper = await mountPost(samplePost())

    expect(wrapper.find('.toc--disclosure').exists()).toBe(true)
    expect(wrapper.find('.toc--rail').exists()).toBe(false)
    // Near the article header, ahead of the body it indexes.
    expect(wrapper.find('.post-header + .toc--disclosure').exists()).toBe(true)
  })

  it('moves into the side rail once the viewport can hold one', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const wrapper = await mountPost(samplePost())

    // Teleported to the body, clear of the reading column.
    expect(wrapper.find('.toc--disclosure').exists()).toBe(false)
    expect(document.body.querySelector('.toc--rail')).not.toBeNull()
  })
})
