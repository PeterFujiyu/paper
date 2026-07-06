import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: [String, Object], default: '' }, ariaLabel: { type: String, default: '' } },
    setup: (_, { slots }) => () => h('a', slots.default?.()),
  }),
  RouterView: defineComponent({ name: 'RouterView', setup: () => () => h('div') }),
}))

vi.mock('../../src/shared/AppDialog.vue', () => ({
  default: defineComponent({ name: 'AppDialog', setup: () => () => h('div') }),
}))

import App from '../../src/App.vue'

const writeText = vi.fn().mockResolvedValue(undefined)

describe('App shell accessibility', () => {
  beforeEach(() => {
    writeText.mockClear()
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    if (!window.matchMedia) {
      // Guard in case the environment omits it — App reads it on mount.
      window.matchMedia = () =>
        ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
    }
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders the skip link as the first anchor pointing at #main', () => {
    const wrapper = mount(App)
    const first = wrapper.findAll('a')[0]
    expect(first.classes()).toContain('skip-link')
    expect(first.attributes('href')).toBe('#main')
    expect(first.text()).toBe('Skip to content')
  })

  it('names the primary navigation landmark', () => {
    const wrapper = mount(App)
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Primary')
  })

  it('announces a copied eth address through a live region', async () => {
    const wrapper = mount(App)

    await wrapper.find('.eth-toggle').trigger('click')
    await wrapper.find('.eth-address').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('0x590aef1cb9d2c66f2543cbeaa64f603e07fd1679')
    expect(wrapper.find('span.sr-only[role="status"]').text()).toBe('Ethereum address copied')
  })
})
