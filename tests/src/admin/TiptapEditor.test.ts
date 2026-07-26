import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TiptapEditor from '../../../src/admin/components/TiptapEditor.vue'

/** Finds a toolbar button by its accessible name. */
function toolbarButton(wrapper: ReturnType<typeof mount>, name: string) {
  return wrapper.findAll('button.tb-btn').find((btn) => btn.attributes('aria-label') === name)
}

async function mountEditor() {
  const wrapper = mount(TiptapEditor, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('TiptapEditor toolbar action states', () => {
  it('leaves format toggles as toggles, without an action mark', async () => {
    const wrapper = await mountEditor()
    const bold = toolbarButton(wrapper, 'Bold')!

    expect(bold.attributes('aria-pressed')).toBe('false')
    expect(bold.attributes('aria-busy')).toBeUndefined()
    expect(bold.find('.action-mark').exists()).toBe(false)
    expect(bold.text()).toBe('B')

    wrapper.unmount()
  })

  it('reports completion on one-shot inserts', async () => {
    const wrapper = await mountEditor()

    await toolbarButton(wrapper, 'Horizontal rule')!.trigger('click')
    await flushPromises()

    const rule = toolbarButton(wrapper, 'Rule added')!
    expect(rule).toBeDefined()
    expect(rule.find('svg.action-check').exists()).toBe(true)
    expect(rule.attributes('title')).toBe('Rule added')

    wrapper.unmount()
  })

  it('runs the image button through processing and completion, with a live region', async () => {
    const wrapper = await mountEditor()

    expect(toolbarButton(wrapper, 'Insert image')!.text()).toBe('Img')
    expect(wrapper.find('.upload-indicator').text()).toBe('')

    const input = wrapper.find<HTMLInputElement>('input[type="file"]')
    const file = new File(['image-bytes'], 'cover.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')

    // FileReader resolves asynchronously; the button is mid-flight until it does.
    const busy = toolbarButton(wrapper, 'Adding image…')!
    expect(busy).toBeDefined()
    expect(busy.attributes('aria-busy')).toBe('true')
    expect(busy.find('.action-mark--doing').exists()).toBe(true)
    expect(wrapper.find('.upload-indicator').text()).toBe('Reading image…')

    await vi.waitUntil(() => !!toolbarButton(wrapper, 'Image added'))

    const done = toolbarButton(wrapper, 'Image added')!
    expect(done.find('svg.action-check').exists()).toBe(true)
    expect(wrapper.find('.upload-indicator').text()).toBe('Image added')

    wrapper.unmount()
  })
})
