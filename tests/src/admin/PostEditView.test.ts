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

describe('PostEditView reading time', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.params = { id: 'new' }
  })

  const loadedPost = (extra: Record<string, unknown>) => ({
    _id: 'post-1',
    title: 'Existing title',
    slug: 'existing-title',
    excerpt: 'A brief excerpt for the post.',
    content: { type: 'doc', content: [] },
    published: false,
    ...extra,
  })

  const readingField = (wrapper: ReturnType<typeof mount>) =>
    wrapper.find<HTMLInputElement>('#post-reading')

  it('offers an empty field meaning "estimate it" on a new post', async () => {
    const wrapper = await mountView()

    expect(readingField(wrapper).element.value).toBe('')
    expect(readingField(wrapper).attributes('placeholder')).toBe('Auto')
    expect(wrapper.find('#post-reading-help').text()).toBe('Leave blank to estimate from the body.')
  })

  // The crux of the two-field model: an estimate must not prefill the input, or
  // saving again would freeze it while the body goes on changing.
  it('leaves the field on Auto when the stored figure is a derived estimate', async () => {
    apiFetchMock.mockResolvedValueOnce(
      loadedPost({ readingMinutes: 7, readingMinutesOverride: 0 })
    )

    const wrapper = await mountView({ id: 'post-1' })

    expect(readingField(wrapper).element.value).toBe('')
    expect(wrapper.find('#post-reading-help').text()).toContain('7 min read')
  })

  it('prefills the field when the author previously overrode the estimate', async () => {
    apiFetchMock.mockResolvedValueOnce(
      loadedPost({ readingMinutes: 20, readingMinutesOverride: 20 })
    )

    const wrapper = await mountView({ id: 'post-1' })

    expect(readingField(wrapper).element.value).toBe('20')
    expect(wrapper.find('#post-reading-help').text()).toBe('Overrides the estimate from the body.')
  })

  it('sends the override with the save, and null once it is cleared', async () => {
    apiFetchMock
      .mockResolvedValueOnce(loadedPost({ readingMinutes: 7, readingMinutesOverride: 0 }))
      .mockResolvedValue({ available: true, readingMinutes: 20, readingMinutesOverride: 20 })

    const wrapper = await mountView({ id: 'post-1' })

    await readingField(wrapper).setValue('20')
    await wrapper.find('.btn-save').trigger('click')
    await flushPromises()

    const put = apiFetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(put![1].body).readingMinutesOverride).toBe(20)

    await readingField(wrapper).setValue('')
    await wrapper.find('.btn-save').trigger('click')
    await flushPromises()

    const lastPut = apiFetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT').pop()
    expect(JSON.parse(lastPut![1].body).readingMinutesOverride).toBeNull()
  })

  // Rewriting a mistake into a different number is worse than refusing it: 0
  // used to clear the override outright and 1000 used to become 999, both
  // silently. Only a blank field means "estimate it".
  it('keeps an unusable figure in the field and says why instead of rewriting it', async () => {
    apiFetchMock.mockResolvedValueOnce(loadedPost({ readingMinutes: 7, readingMinutesOverride: 0 }))

    const wrapper = await mountView({ id: 'post-1' })

    await readingField(wrapper).setValue('1000')
    expect(readingField(wrapper).element.value).toBe('1000')
    expect(wrapper.find('#post-reading-help').text()).toBe('Reading time must be 999 minutes or fewer.')
    expect(wrapper.find<HTMLButtonElement>('.btn-save').element.disabled).toBe(true)

    await readingField(wrapper).setValue('0')
    expect(readingField(wrapper).element.value).toBe('0')
    expect(wrapper.find('#post-reading-help').text()).toBe('Reading time must be at least 1 minute.')

    await readingField(wrapper).setValue('4.5')
    expect(readingField(wrapper).element.value).toBe('4.5')
    expect(wrapper.find('#post-reading-help').text()).toBe('Reading time must be a whole number of minutes.')

    await wrapper.find('.btn-save').trigger('click')
    await flushPromises()

    expect(apiFetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  // The router reuses this component across posts/new → posts/:id, so nothing
  // reloads the post after the first save.
  it('shows the estimate the server returned for a newly created post', async () => {
    apiFetchMock.mockImplementation((path: string) =>
      path.startsWith('/slug-check')
        ? Promise.resolve({ available: true })
        : Promise.resolve({ _id: 'post-9', readingMinutes: 7, readingMinutesOverride: 0 })
    )

    const wrapper = await mountView()

    await wrapper.find('input.field-title').setValue('A new essay')
    await wrapper.find('input.field-input').setValue('a-new-essay')
    await wrapper.find('#post-excerpt').setValue('A brief excerpt for the post.')
    wrapper.findComponent({ name: 'TiptapEditor' }).vm.$emit('update:modelValue', { type: 'doc', content: [] })
    await flushPromises()

    await wrapper.find('.btn-save').trigger('click')
    await flushPromises()

    expect(routerReplaceMock).toHaveBeenCalledWith('/admin/posts/post-9')
    expect(wrapper.find('#post-reading-help').text()).toContain('7 min read')
  })
})
