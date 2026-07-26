import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const apiFetchMock = vi.hoisted(() => vi.fn())
const routerPushMock = vi.hoisted(() => vi.fn())
const routerReplaceMock = vi.hoisted(() => vi.fn())
const confirmDialogMock = vi.hoisted(() => vi.fn())
const routeState = vi.hoisted(() => ({ params: {} as Record<string, string> }))

vi.mock('../../../src/admin/store.ts', () => ({
  apiFetch: apiFetchMock,
}))

vi.mock('../../../src/shared/dialog.ts', () => ({
  confirmDialog: confirmDialogMock,
}))

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: [String, Object], default: '' } },
    setup(_, { slots }) {
      return () => h('a', slots.default?.())
    },
  }),
  useRoute: () => routeState,
  useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }),
}))

vi.mock('../../../src/admin/components/TiptapEditor.vue', () => ({
  default: defineComponent({
    name: 'TiptapEditor',
    props: { modelValue: { type: Object, default: null } },
    emits: ['update:modelValue'],
    setup() {
      return () => h('div', { 'data-test': 'editor' })
    },
  }),
}))

import NoteEditView from '../../../src/admin/views/NoteEditView.vue'

const WRITTEN_NOTE = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A thought.' }] }] }

async function mountView(params: Record<string, string> = { id: 'new' }) {
  routeState.params = params
  const wrapper = mount(NoteEditView)
  await flushPromises()
  return wrapper
}

/** Feed the mocked editor real content so Save leaves its disabled state. */
async function writeSomething(wrapper: ReturnType<typeof mount>) {
  await wrapper.findComponent({ name: 'TiptapEditor' }).vm.$emit('update:modelValue', WRITTEN_NOTE)
  await flushPromises()
}

describe('NoteEditView save button states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.params = { id: 'new' }
  })

  it('reads "Save" and stays disabled until something is written', async () => {
    const wrapper = await mountView()
    const save = wrapper.find('button.btn-save')

    expect(save.text()).toBe('Save')
    expect(save.attributes('disabled')).toBeDefined()
    expect(save.attributes('aria-busy')).toBe('false')
  })

  it('shows the processing state while saving, then the completion label', async () => {
    let release = (): void => {}
    apiFetchMock.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ _id: 'note-1' })
    }))

    const wrapper = await mountView()
    await writeSomething(wrapper)
    await wrapper.find('button.btn-save').trigger('click')
    await flushPromises()

    const saving = wrapper.find('button.btn-save')
    expect(saving.text()).toBe('Saving…')
    expect(saving.attributes('aria-busy')).toBe('true')
    expect(saving.classes()).toContain('btn-save--busy')
    expect(saving.find('.action-mark--doing').exists()).toBe(true)

    release()
    await flushPromises()

    const saved = wrapper.find('button.btn-save')
    expect(saved.text()).toBe('Saved')
    expect(saved.classes()).toContain('btn-save--done')
    expect(saved.find('svg.action-check').exists()).toBe(true)
    expect(saved.attributes('aria-busy')).toBe('false')
  })

  it('returns to "Save" and surfaces the error when the request fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('Request failed'))

    const wrapper = await mountView()
    await writeSomething(wrapper)
    await wrapper.find('button.btn-save').trigger('click')
    await flushPromises()

    expect(wrapper.find('button.btn-save').text()).toBe('Save')
    expect(wrapper.find('.edit-error').text()).toBe('Request failed')
  })

  it('ignores a second click while a save is in flight', async () => {
    apiFetchMock.mockImplementation(() => new Promise(() => {}))

    const wrapper = await mountView()
    await writeSomething(wrapper)
    await wrapper.find('button.btn-save').trigger('click')
    await flushPromises()
    await wrapper.find('button.btn-save').trigger('click')
    await flushPromises()

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('NoteEditView delete button states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    routeState.params = { id: 'note-1' }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds "Deleted" for a beat before leaving for the list', async () => {
    apiFetchMock.mockResolvedValue({ content: WRITTEN_NOTE })
    confirmDialogMock.mockResolvedValue(true)

    routeState.params = { id: 'note-1' }
    const wrapper = mount(NoteEditView)
    await flushPromises()

    apiFetchMock.mockResolvedValue({ ok: true })
    await wrapper.find('button.btn-delete').trigger('click')
    await flushPromises()

    const deleted = wrapper.find('button.btn-delete')
    expect(deleted.text()).toBe('Deleted')
    expect(deleted.find('svg.action-check').exists()).toBe(true)
    expect(routerPushMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(700)
    expect(routerPushMock).toHaveBeenCalledWith('/admin/notes')
  })

  it('does not touch the API when the confirmation is dismissed', async () => {
    apiFetchMock.mockResolvedValue({ content: WRITTEN_NOTE })
    confirmDialogMock.mockResolvedValue(false)

    routeState.params = { id: 'note-1' }
    const wrapper = mount(NoteEditView)
    await flushPromises()
    apiFetchMock.mockClear()

    await wrapper.find('button.btn-delete').trigger('click')
    await flushPromises()

    expect(apiFetchMock).not.toHaveBeenCalled()
    expect(wrapper.find('button.btn-delete').text()).toBe('Delete')
  })
})
