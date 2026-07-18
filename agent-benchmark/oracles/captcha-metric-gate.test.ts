import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PostView from '../../src/views/PostView.vue'

const { getHCaptchaToken } = vi.hoisted(() => ({
  getHCaptchaToken: vi.fn(),
}))

vi.mock('../../src/shared/hcaptcha', () => ({
  getHCaptchaToken,
}))

function response(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('PostView metric hCaptcha retry', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    getHCaptchaToken.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('retries the initial view metric once with the token and unchanged endpoint/slug', async () => {
    getHCaptchaToken.mockResolvedValue('captcha-token')

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(true, {
        slug: 'same-slug',
        title: 'Essay',
        content: { type: 'doc', content: [] },
        createdAt: '2026-01-01T00:00:00.000Z',
        viewCount: 0,
        readCompletionRate: 0,
      }))
      .mockResolvedValueOnce(response(false, { requiresHCaptcha: true }))
      .mockResolvedValueOnce(response(true, {
        viewCount: 1,
        readCompletionRate: 0,
      }))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(PostView, {
      props: { slug: 'same-slug' },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    await flushPromises()
    await flushPromises()

    expect(getHCaptchaToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const firstMetric = fetchMock.mock.calls[1]
    const retryMetric = fetchMock.mock.calls[2]
    expect(firstMetric[0]).toBe('/api/post-view')
    expect(retryMetric[0]).toBe(firstMetric[0])
    expect(JSON.parse(firstMetric[1]?.body as string)).toEqual({
      slug: 'same-slug',
    })
    expect(JSON.parse(retryMetric[1]?.body as string)).toEqual({
      slug: 'same-slug',
      hcaptchaToken: 'captcha-token',
    })

    wrapper.unmount()
  })

  it('retries a challenged completion metric with the token and unchanged endpoint/slug', async () => {
    const frameCallbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    }))
    getHCaptchaToken.mockResolvedValue('completion-token')

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/post?')) {
        return response(true, {
          slug: 'same-slug',
          title: 'Essay',
          content: { type: 'doc', content: [] },
          createdAt: '2026-01-01T00:00:00.000Z',
          viewCount: 0,
          readCompletionRate: 0,
        })
      }

      if (url === '/api/post-view') {
        return response(true, {
          viewCount: 1,
          readCompletionRate: 0,
        })
      }

      if (url === '/api/post-completion') {
        const body = JSON.parse(init?.body as string) as {
          hcaptchaToken?: string
        }
        if (body.hcaptchaToken === 'completion-token') {
          return response(true, {
            viewCount: 1,
            readCompletionRate: 100,
          })
        }
        return response(false, { requiresHCaptcha: true })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(PostView, {
      props: { slug: 'same-slug' },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    await flushPromises()
    await flushPromises()

    expect(frameCallbacks).toHaveLength(1)

    frameCallbacks[0](0)
    await flushPromises()
    await flushPromises()

    const completionCalls = fetchMock.mock.calls.filter(
      ([url]) => url === '/api/post-completion',
    )
    expect(getHCaptchaToken).toHaveBeenCalledTimes(1)
    expect(completionCalls).toHaveLength(2)
    expect(completionCalls[1][0]).toBe(completionCalls[0][0])
    expect(JSON.parse(completionCalls[0][1]?.body as string)).toEqual({
      slug: 'same-slug',
    })
    expect(JSON.parse(completionCalls[1][1]?.body as string)).toEqual({
      slug: 'same-slug',
      hcaptchaToken: 'completion-token',
    })

    const viewCallIndex = fetchMock.mock.calls.findIndex(
      ([url]) => url === '/api/post-view',
    )
    const firstCompletionIndex = fetchMock.mock.calls.findIndex(
      ([url]) => url === '/api/post-completion',
    )
    expect(viewCallIndex).toBeGreaterThan(-1)
    expect(firstCompletionIndex).toBeGreaterThan(viewCallIndex)

    wrapper.unmount()
  })
})
