import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadingIndicator from '../../../src/components/LoadingIndicator.vue'

describe('LoadingIndicator', () => {
  it('falls back to a generic label', () => {
    const wrapper = mount(LoadingIndicator)
    expect(wrapper.text()).toBe('Loading…')
  })

  it('renders the caller-supplied label beside the mark', () => {
    const wrapper = mount(LoadingIndicator, { props: { label: 'Loading essays…' } })
    expect(wrapper.text()).toBe('Loading essays…')
  })

  it('hides the decorative mark from assistive tech', () => {
    const svg = mount(LoadingIndicator).find('svg.loading-mark')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
  })

  it('animates layers by class, so two loaders can coexist without id clashes', () => {
    const wrapper = mount(LoadingIndicator)
    expect(wrapper.findAll('.mark-layer')).toHaveLength(4)
    expect(wrapper.find('[id]').exists()).toBe(false)
  })
})
