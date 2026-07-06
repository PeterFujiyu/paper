import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const apiFetchMock = vi.hoisted(() => vi.fn())
const routerPushMock = vi.hoisted(() => vi.fn())
const routerReplaceMock = vi.hoisted(() => vi.fn())
const routeState = vi.hoisted(() => ({
  params: {} as Record<string, string>,
}))

vi.mock('../../../src/admin/store.ts', () => ({
  apiFetch: apiFetchMock,
}))

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: {
      to: {
        type: [String, Object],
        default: '',
      },
    },
    setup(_, { slots }) {
      return () => h('a', slots.default?.())
    },
  }),
  useRoute: () => routeState,
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
  }),
}))

vi.mock('../../../src/admin/components/TiptapEditor.vue', () => ({
  default: defineComponent({
    name: 'TiptapEditor',
    props: {
      modelValue: {
        type: Object,
        default: null,
      },
    },
    emits: ['update:modelValue'],
    setup() {
      return () => h('div', { 'data-test': 'editor' })
    },
  }),
}))

import PostEditView from '../../../src/admin/views/PostEditView.vue'

async function mountView(params: Record<string, string> = { id: 'new' }) {
  routeState.params = params
  const wrapper = mount(PostEditView)
  await flushPromises()
  return wrapper
}

describe('PostEditView slug interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.params = { id: 'new' }
  })

  it('auto-generates a slug from the title and checks availability on blur', async () => {
    apiFetchMock.mockResolvedValue({ available: true })
    const wrapper = await mountView()

    await wrapper.find('input.field-title').setValue('Hello, World!')
    await wrapper.find('input.field-title').trigger('blur')
    await flushPromises()

    expect(wrapper.find<HTMLInputElement>('input.field-input').element.value).toBe('hello-world')
    expect(apiFetchMock).toHaveBeenCalledWith('/slug-check?slug=hello-world')
    expect(wrapper.text()).toContain('Slug is available.')
  })

  it('keeps a manually entered slug when the title loses focus', async () => {
    apiFetchMock.mockResolvedValue({ available: true })
    const wrapper = await mountView()

    await wrapper.find('input.field-input').setValue('custom-slug')
    await wrapper.find('input.field-title').setValue('Hello, World!')
    await wrapper.find('input.field-title').trigger('blur')
    await flushPromises()

    expect(wrapper.find<HTMLInputElement>('input.field-input').element.value).toBe('custom-slug')
    expect(apiFetchMock).toHaveBeenCalledWith('/slug-check?slug=custom-slug')
  })

  it('normalizes edit slugs and includes excludeId in availability checks', async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        _id: 'post-1',
        title: 'Existing title',
        slug: 'draft-copy',
        excerpt: 'A brief excerpt for the post.',
        content: { type: 'doc', content: [] },
        published: false,
      })
      .mockResolvedValueOnce({ available: false })

    const wrapper = await mountView({ id: 'post-1' })

    expect(apiFetchMock).toHaveBeenCalledWith('/admin-post?id=post-1')

    await wrapper.find('input.field-input').setValue('Taken-Slug')
    await wrapper.find('input.field-input').trigger('blur')
    await flushPromises()

    expect(wrapper.find<HTMLInputElement>('input.field-input').element.value).toBe('taken-slug')
    expect(apiFetchMock).toHaveBeenLastCalledWith('/slug-check?slug=taken-slug&excludeId=post-1')
    expect(wrapper.text()).toContain('Slug is already in use.')
  })
})

describe('PostEditView accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.params = { id: 'new' }
  })

  it('associates each field label with a control and names the title', async () => {
    const wrapper = await mountView()

    const labels = wrapper.findAll('label')
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      const forId = label.attributes('for')
      if (forId) {
        expect(wrapper.find(`#${forId}`).exists()).toBe(true)
      } else {
        // Implicit association: the publish toggle wraps its own checkbox.
        expect(label.find('input, textarea, select').exists()).toBe(true)
      }
    }

    // The editorial title field carries its name via aria-label, not a <label>.
    expect(wrapper.find('input.field-title').attributes('aria-label')).toBe('Post title')
  })

  it('keeps a persistent slug status region that fills after a check', async () => {
    apiFetchMock.mockResolvedValue({ available: true })
    const wrapper = await mountView()

    const help = wrapper.find('#post-slug-help')
    expect(help.exists()).toBe(true)
    expect(help.attributes('role')).toBe('status')
    expect(help.text()).toBe('')

    await wrapper.find('input.field-title').setValue('Hello World')
    await wrapper.find('input.field-title').trigger('blur')
    await flushPromises()

    expect(wrapper.find('#post-slug-help').text()).toContain('Slug is available.')
    expect(wrapper.find('input.field-input').attributes('aria-describedby')).toBe('post-slug-help')
  })

  it('marks the validation error as an alert', async () => {
    const wrapper = await mountView()
    const err = wrapper.find('.edit-error')
    expect(err.exists()).toBe(true)
    expect(err.attributes('role')).toBe('alert')
  })
})
