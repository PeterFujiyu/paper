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
