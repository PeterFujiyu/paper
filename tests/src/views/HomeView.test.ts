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

// Route /posts vs /notes to separate payloads; both list and search share paths.
function stubFetch(posts: unknown[], notes: unknown[]) {
  return vi.fn((input: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(input).includes('/notes') ? notes : posts),
    }),
  )
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

    // Two persistent regions (writing + notes), both showing Loading… pre-resolve.
    const regions = wrapper.findAll('[role="status"]')
    expect(regions.length).toBeGreaterThanOrEqual(2)
    expect(regions[0].text()).toContain('Loading…')

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
