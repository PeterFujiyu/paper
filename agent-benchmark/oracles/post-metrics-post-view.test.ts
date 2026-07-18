import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PostView from '../../src/views/PostView.vue'

type FrameCallback = (time: number) => void

const post = {
  _id: 'post-1',
  slug: 'measured-essay',
  title: 'Measured essay',
  excerpt: 'An essay with reader metrics.',
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello.' }] }],
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  published: true,
  viewCount: 17,
  readCompletionCount: 7,
  readCompletionRate: 42,
}

const nextPost = {
  ...post,
  _id: 'post-2',
  slug: 'next-essay',
  title: 'Next essay',
  viewCount: 5,
  readCompletionCount: 1,
  readCompletionRate: 20,
}

describe('PostView reader metrics', () => {
  let wrapper: VueWrapper | undefined
  let frames: FrameCallback[]

  beforeEach(() => {
    frames = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('tracks one completion per slug while the same view instance is reused', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => post,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          viewCount: 17,
          readCompletionCount: 8,
          readCompletionRate: 55,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => nextPost,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          viewCount: 5,
          readCompletionCount: 2,
          readCompletionRate: 40,
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    wrapper = mount(PostView, {
      props: { slug: post.slug },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/post?slug=measured-essay')
    expect(wrapper.text()).toContain('17 views')
    expect(wrapper.text()).toContain('42% read completion')

    const article = wrapper.get('article').element as HTMLElement
    Object.defineProperty(article, 'offsetTop', { configurable: true, value: 100 })
    Object.defineProperty(article, 'offsetHeight', { configurable: true, value: 1000 })

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 200 })
    frames.shift()?.(0)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(1)

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 450 })
    window.dispatchEvent(new Event('scroll'))
    frames.shift()?.(1)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/post-completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'measured-essay' }),
    })
    expect(wrapper.text()).toContain('17 views')
    expect(wrapper.text()).toContain('55% read completion')

    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    frames.splice(0).forEach(callback => callback(1))
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)

    await wrapper.setProps({ slug: nextPost.slug })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/post?slug=next-essay')
    expect(wrapper.text()).toContain('5 views')
    expect(wrapper.text()).toContain('20% read completion')

    const nextArticle = wrapper.get('article').element as HTMLElement
    Object.defineProperty(nextArticle, 'offsetTop', { configurable: true, value: 100 })
    Object.defineProperty(nextArticle, 'offsetHeight', { configurable: true, value: 1000 })
    frames.shift()?.(2)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/post-completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'next-essay' }),
    })
    expect(wrapper.text()).toContain('5 views')
    expect(wrapper.text()).toContain('40% read completion')

    window.dispatchEvent(new Event('scroll'))
    frames.splice(0).forEach(callback => callback(3))
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
