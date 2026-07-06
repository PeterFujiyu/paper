import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

import AppDialog from '../../../src/shared/AppDialog.vue'
import { confirmDialog, settleDialog, dialogState } from '../../../src/shared/dialog'

// Teleport targets document.body, so the panel is queried there, not via wrapper.
function panel(): HTMLElement | null {
  return document.body.querySelector('.dialog')
}
function confirmButton(): HTMLElement {
  return document.body.querySelector('.dialog-btn--confirm') as HTMLElement
}
function cancelButton(): HTMLElement {
  return document.body.querySelector('.dialog-btn--cancel') as HTMLElement
}

describe('AppDialog', () => {
  let wrapper: ReturnType<typeof mount>

  beforeEach(() => {
    wrapper = mount(AppDialog, { attachTo: document.body })
  })

  afterEach(async () => {
    // Settle any dialog a test left open so state doesn't leak across tests.
    if (dialogState.active) settleDialog(false)
    await flushPromises()
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('renders an accessible modal and focuses the confirm button', async () => {
    const promise = confirmDialog({ title: 'Delete', message: 'Are you sure?' })
    await flushPromises()

    const p = panel()
    expect(p).not.toBeNull()
    expect(p!.getAttribute('role')).toBe('alertdialog')
    expect(p!.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(confirmButton())

    cancelButton().click()
    await promise
  })

  it('traps Tab within the dialog', async () => {
    const promise = confirmDialog({ message: 'Are you sure?' })
    await flushPromises()

    const cancel = cancelButton()
    const confirm = confirmButton()

    // Focus on the last control; Tab forward wraps to the first.
    confirm.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }))
    await nextTick()
    expect(document.activeElement).toBe(cancel)

    // Shift+Tab on the first control wraps back to the last.
    cancel.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }))
    await nextTick()
    expect(document.activeElement).toBe(confirm)

    cancel.click()
    await promise
  })

  it('closes on Escape, resolves false, and restores focus', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const promise = confirmDialog({ message: 'Are you sure?' })
    await flushPromises()
    expect(panel()).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await expect(promise).resolves.toBe(false)
    await flushPromises()
    await nextTick()

    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
