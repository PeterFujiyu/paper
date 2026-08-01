import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: [String, Object], default: '' } },
    setup: (_, { slots }) => () => h('a', slots.default?.()),
  }),
  useRoute: () => ({ hash: '' }),
}))

import HomeView from '../../../src/views/HomeView.vue'

function samplePost() {
  return {
    _id: '1',
    slug: 'a-post',
    title: 'A Post',
    excerpt: 'A brief excerpt.',
    createdAt: new Date().toISOString(),
    viewCount: 3,
    tags: [],
  }
}

// Route /posts vs /notes vs /brews to separate payloads; both list and search
// share paths. Coffee Time answers with an object, not a bare array.
const emptyBrews = { brews: [], shelf: { cups: 0, origins: 0, topMethod: '' } }

function stubFetch(posts: unknown[], notes: unknown[], brews: unknown = emptyBrews) {
  return vi.fn((input: string) => {
    const url = String(input)
    const body = url.includes('/notes') ? notes : url.includes('/brews') ? brews : posts
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
  })
}

describe('HomeView live regions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('exposes a focusable main landmark', async () => {
    vi.stubGlobal('fetch', stubFetch([], []))
    const wrapper = mount(HomeView)

    const main = wrapper.find('main#main')
    expect(main.exists()).toBe(true)
    expect(main.attributes('tabindex')).toBe('-1')

    await flushPromises()
  })

  it('announces loading, then clears the region once posts arrive', async () => {
    vi.stubGlobal('fetch', stubFetch([samplePost()], []))
    const wrapper = mount(HomeView)

    // Two persistent regions (writing + notes), each announcing its own load.
    const regions = wrapper.findAll('[role="status"]')
    expect(regions.length).toBeGreaterThanOrEqual(2)
    expect(regions[0].text()).toContain('Loading essays…')
    expect(regions[1].text()).toContain('Loading notes…')

    await flushPromises()

    // Writing region empties because the list now renders in its place.
    expect(wrapper.findAll('[role="status"]')[0].text()).toBe('')
    expect(wrapper.find('ol.article-list').exists()).toBe(true)
  })

  it('surfaces Searching… in the same region while a query is pending', async () => {
    vi.stubGlobal('fetch', stubFetch([samplePost()], []))
    const wrapper = mount(HomeView)
    await flushPromises()

    await wrapper.find('input[aria-label="Search essays"]').setValue('design')

    expect(wrapper.findAll('[role="status"]')[0].text()).toContain('Searching…')
  })
})

describe('HomeView reading time', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the estimate in the card meta when the post carries one', async () => {
    vi.stubGlobal('fetch', stubFetch([{ ...samplePost(), readingMinutes: 8 }], []))
    const wrapper = mount(HomeView)
    await flushPromises()

    expect(wrapper.find('.article-meta').text()).toContain('8 min read')
  })

  // Posts written before the field existed have nothing to show; an empty span
  // or "0 min read" would be worse than no span at all.
  it('omits it entirely when the post has none', async () => {
    vi.stubGlobal('fetch', stubFetch([samplePost()], []))
    const wrapper = mount(HomeView)
    await flushPromises()

    expect(wrapper.find('.article-meta').text()).not.toContain('min read')
    expect(wrapper.findAll('.article-meta span')).toHaveLength(2)
  })

  it('omits it for an explicit zero', async () => {
    vi.stubGlobal('fetch', stubFetch([{ ...samplePost(), readingMinutes: 0 }], []))
    const wrapper = mount(HomeView)
    await flushPromises()

    expect(wrapper.find('.article-meta').text()).not.toContain('min read')
  })
})
