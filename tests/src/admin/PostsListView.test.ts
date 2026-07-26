import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const apiFetchMock = vi.hoisted(() => vi.fn())
const logoutMock = vi.hoisted(() => vi.fn())
const routerPushMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/admin/store.ts', () => ({
  apiFetch: apiFetchMock,
  logout: logoutMock,
}))

vi.mock('vue-router', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    RouterLink: defineComponent({
      name: 'RouterLink',
      props: { to: { type: [String, Object], default: '' } },
      setup(_, { slots }) {
        return () => h('a', slots.default?.())
      },
    }),
    useRouter: () => ({ push: routerPushMock }),
  }
})

import PostsListView from '../../../src/admin/views/PostsListView.vue'

async function mountView() {
  apiFetchMock.mockResolvedValue([])
  const wrapper = mount(PostsListView)
  await flushPromises()
  return wrapper
}

function signOutButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((btn) => btn.classes().includes('btn-ghost'))!
}

describe('PostsListView sign out button states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads "Sign out" at rest', async () => {
    const wrapper = await mountView()
    expect(signOutButton(wrapper).text()).toBe('Sign out')
  })

  it('shows the processing state, then "Signed out" before redirecting', async () => {
    let release = (): void => {}
    logoutMock.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))

    const wrapper = await mountView()
    await signOutButton(wrapper).trigger('click')
    await flushPromises()

    const busy = signOutButton(wrapper)
    expect(busy.text()).toBe('Signing out…')
    expect(busy.attributes('aria-busy')).toBe('true')
    expect(busy.find('.action-mark--doing').exists()).toBe(true)

    release()
    await flushPromises()

    const done = signOutButton(wrapper)
    expect(done.text()).toBe('Signed out')
    expect(done.find('svg.action-check').exists()).toBe(true)
    expect(routerPushMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(700)
    expect(routerPushMock).toHaveBeenCalledWith('/admin/login')
  })

  it('still redirects when the logout request fails', async () => {
    logoutMock.mockRejectedValue(new Error('Request failed'))

    const wrapper = await mountView()
    await signOutButton(wrapper).trigger('click')
    await flushPromises()

    expect(signOutButton(wrapper).text()).toBe('Sign out')
    expect(routerPushMock).toHaveBeenCalledWith('/admin/login')
  })
})
