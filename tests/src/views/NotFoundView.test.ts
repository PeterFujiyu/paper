import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: [String, Object], default: '' } },
    setup: (props, { slots }) => () => h('a', { href: String(props.to) }, slots.default?.()),
  }),
}))

import NotFoundView from '../../../src/views/NotFoundView.vue'
import NotFound from '../../../src/components/NotFound.vue'

describe('NotFoundView', () => {
  afterEach(() => {
    document.title = ''
  })

  it('renders the slot machine, heading and a way home inside the skip-link target', () => {
    const wrapper = mount(NotFoundView)

    expect(wrapper.find('main#main').exists()).toBe(true)
    expect(wrapper.find('h1').text()).toBe('Page not found')
    expect(wrapper.find('button.slot-machine').attributes('aria-label')).toBe('Pull the lever')
    expect(wrapper.find('button.slot-machine svg').attributes('aria-hidden')).toBe('true')
    const link = wrapper.find('a.not-found-link')
    expect(link.attributes('href')).toBe('/')
    expect(link.text()).toBe('Back to writing')
  })

  it('titles the tab while mounted and restores it after', () => {
    const wrapper = mount(NotFoundView)
    expect(document.title).toBe('Page not found — Paper')
    wrapper.unmount()
    expect(document.title).toBe('Paper')
  })

  it('lets a caller reword the copy', () => {
    const wrapper = mount(NotFound, { props: { title: 'Essay not found', message: 'Gone.' } })
    expect(wrapper.find('h1').text()).toBe('Essay not found')
    expect(wrapper.find('.not-found-msg').text()).toBe('Gone.')
  })
})
