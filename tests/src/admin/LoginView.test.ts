import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const apiFetchMock = vi.hoisted(() => vi.fn())
const setAuthMock = vi.hoisted(() => vi.fn())
const routerPushMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/admin/store.ts', () => ({
  apiFetch: apiFetchMock,
  setAuth: setAuthMock,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

import LoginView from '../../../src/admin/views/LoginView.vue'

describe('LoginView accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a focusable main landmark', () => {
    const wrapper = mount(LoginView)
    const main = wrapper.find('main#main')
    expect(main.exists()).toBe(true)
    expect(main.attributes('tabindex')).toBe('-1')
  })

  it('associates every field label with its input, including register mode', async () => {
    const wrapper = mount(LoginView)

    // Reveal the name + invite fields so all four labels render.
    const toggle = wrapper.findAll('button').find((b) => b.text() === 'Register')
    expect(toggle).toBeTruthy()
    await toggle!.trigger('click')

    const labels = wrapper.findAll('label')
    expect(labels.map((l) => l.attributes('for'))).toEqual([
      'login-name',
      'login-invite',
      'login-email',
      'login-password',
    ])
    for (const label of labels) {
      const forId = label.attributes('for')!
      expect(wrapper.find(`#${forId}`).exists()).toBe(true)
    }
  })

  it('exposes the error as role="alert" and wires it to the fields', () => {
    // Sign-in mode with an empty email → validationMessage drives the error.
    const wrapper = mount(LoginView)

    const err = wrapper.find('#auth-error')
    expect(err.exists()).toBe(true)
    expect(err.attributes('role')).toBe('alert')

    const email = wrapper.find('#login-email')
    expect(email.attributes('aria-describedby')).toBe('auth-error')
    expect(email.attributes('aria-invalid')).toBe('true')

    const password = wrapper.find('#login-password')
    expect(password.attributes('aria-describedby')).toBe('auth-error')
  })
})
