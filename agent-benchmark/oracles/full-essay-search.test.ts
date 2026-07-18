import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import HomeView from '../../src/views/HomeView.vue'

const RouterLinkStub = defineComponent({
  template: '<a><slot /></a>',
})

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

interface SearchRequest {
  url: string
  signal: AbortSignal
  deferred: Deferred<Response>
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    json: async () => value,
  } as Response
}

function post(title: string, slug: string) {
  return {
    _id: slug,
    slug,
    title,
    excerpt: `${title} excerpt`,
    createdAt: '2026-01-01T00:00:00.000Z',
    viewCount: 0,
    readCompletionCount: 0,
    readCompletionRate: 0,
    tags: [],
  }
}

describe('HomeView essay search', () => {
  const defaultPosts = [post('Default essay', 'default-essay')]
  const newestResults = [post('Newest result', 'newest-result')]
  const searchRequests: SearchRequest[] = []
  const fetchMock = vi.fn()
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    searchRequests.length = 0
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/posts') {
          return Promise.resolve(jsonResponse(defaultPosts))
        }

        const signal = init?.signal
        if (!(signal instanceof AbortSignal)) {
          return Promise.reject(
            new Error('Search requests must carry an AbortSignal'),
          )
        }

        const pending = deferred<Response>()
        signal.addEventListener(
          'abort',
          () => pending.reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
        searchRequests.push({ url, signal, deferred: pending })
        return pending.promise
      },
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('debounces, aborts stale searches, and restores the default list when cleared', async () => {
    wrapper = mount(HomeView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })
    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/posts')
    expect(wrapper.text()).toContain('Default essay')

    const input = wrapper.get('input[aria-label="Search essays"]')
    await input.setValue('first query')

    await vi.advanceTimersByTimeAsync(199)
    expect(searchRequests).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(searchRequests).toHaveLength(1)
    expect(searchRequests[0].url).toBe('/api/posts?q=first%20query')

    await input.setValue('newer query')
    await flushPromises()
    expect(searchRequests[0].signal.aborted).toBe(true)

    await vi.advanceTimersByTimeAsync(200)
    expect(searchRequests).toHaveLength(2)
    expect(searchRequests[1].url).toBe('/api/posts?q=newer%20query')

    searchRequests[1].deferred.resolve(jsonResponse(newestResults))
    await flushPromises()
    expect(wrapper.text()).toContain('Newest result')
    expect(wrapper.text()).not.toContain('Default essay')

    searchRequests[0].deferred.resolve(
      jsonResponse([post('Stale result', 'stale')]),
    )
    await flushPromises()
    expect(wrapper.text()).toContain('Newest result')
    expect(wrapper.text()).not.toContain('Stale result')

    await input.setValue('')
    await flushPromises()
    expect(wrapper.text()).toContain('Default essay')
    expect(wrapper.text()).not.toContain('Newest result')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
