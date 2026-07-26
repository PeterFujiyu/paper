import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const apiFetchMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/admin/store.ts', () => ({
  apiFetch: apiFetchMock,
  user: ref({ id: 'user-1', email: 'a@b.com', name: 'Alice' }),
}))

import AccountView from '../../../src/admin/views/AccountView.vue'

const mountOptions = {
  global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
}

/** Fill the form with a valid password change. */
async function fillValid(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('#account-current').setValue('old-password')
  await wrapper.find('#account-new').setValue('new-password')
  await wrapper.find('#account-confirm').setValue('new-password')
}

describe('AccountView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiFetchMock.mockResolvedValue({ ok: true })
  })

  it('associates every field label with its input', () => {
    const wrapper = mount(AccountView, mountOptions)

    const labels = wrapper.findAll('label')
    expect(labels.map((l) => l.attributes('for'))).toEqual([
      'account-current',
      'account-new',
      'account-confirm',
    ])
    for (const label of labels) {
      expect(wrapper.find(`#${label.attributes('for')!}`).exists()).toBe(true)
    }
  })

  it('exposes the error as role="alert" and wires it to the fields', () => {
    // Empty form → validationMessage drives the error paragraph.
    const wrapper = mount(AccountView, mountOptions)

    const err = wrapper.find('#account-error')
    expect(err.exists()).toBe(true)
    expect(err.attributes('role')).toBe('alert')
    expect(wrapper.find('#account-current').attributes('aria-describedby')).toBe('account-error')
    expect(wrapper.find('#account-current').attributes('aria-invalid')).toBe('true')
  })

  it('blocks submission when the confirmation does not match', async () => {
    const wrapper = mount(AccountView, mountOptions)
    await wrapper.find('#account-current').setValue('old-password')
    await wrapper.find('#account-new').setValue('new-password')
    await wrapper.find('#account-confirm').setValue('different-password')

    await wrapper.find('form').trigger('submit')

    expect(apiFetchMock).not.toHaveBeenCalled()
    expect(wrapper.find('#account-error').text()).toBe('New passwords do not match.')
  })

  it('posts the change and clears the fields on success', async () => {
    const wrapper = mount(AccountView, mountOptions)
    await fillValid(wrapper)

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledOnce())

    const [path, options] = apiFetchMock.mock.calls[0] as [string, { method: string; body: string }]
    expect(path).toBe('/auth-password')
    expect(options.method).toBe('POST')
    // The confirmation field is client-side only — it must not be sent.
    expect(JSON.parse(options.body)).toEqual({
      currentPassword: 'old-password',
      newPassword: 'new-password',
    })

    await vi.waitFor(() => {
      expect((wrapper.find('#account-current').element as HTMLInputElement).value).toBe('')
    })
  })

  // Regression: clearing the fields on success makes validationMessage read
  // "Current password is required." again, which rendered the error paragraph
  // right next to "Password updated."
  it('shows no error alongside the success message, and restores guidance on the next keystroke', async () => {
    const wrapper = mount(AccountView, mountOptions)
    await fillValid(wrapper)

    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.find('.auth-success').exists()).toBe(true)
    })

    expect(wrapper.find('#account-error').exists()).toBe(false)
    expect(wrapper.find('#account-current').attributes('aria-invalid')).toBeUndefined()

    // Typing again drops the success flag, so validation guidance returns.
    await wrapper.find('#account-current').setValue('typing-again')
    expect(wrapper.find('.auth-success').exists()).toBe(false)
    expect(wrapper.find('#account-error').text()).toBe('New password is required.')
  })

  it('surfaces a server error message', async () => {
    apiFetchMock.mockRejectedValue(new Error('Current password is incorrect.'))
    const wrapper = mount(AccountView, mountOptions)
    await fillValid(wrapper)

    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.find('#account-error').text()).toBe('Current password is incorrect.')
    })
  })
})
