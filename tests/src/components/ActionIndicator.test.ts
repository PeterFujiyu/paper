import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ActionIndicator from '../../../src/components/ActionIndicator.vue'

describe('ActionIndicator', () => {
  it('renders nothing while idle so text buttons keep their resting width', () => {
    const wrapper = mount(ActionIndicator, { props: { phase: 'idle' } })
    expect(wrapper.find('.action-mark').exists()).toBe(false)
  })

  it('shows the spinning arc while an action is in flight', () => {
    const wrapper = mount(ActionIndicator, { props: { phase: 'doing' } })
    const mark = wrapper.find('.action-mark')
    expect(mark.classes()).toContain('action-mark--doing')
    expect(mark.find('svg').exists()).toBe(false)
    expect(mark.attributes('aria-hidden')).toBe('true')
  })

  it('shows a check on completion', () => {
    const wrapper = mount(ActionIndicator, { props: { phase: 'done' } })
    expect(wrapper.find('.action-mark').classes()).toContain('action-mark--done')
    expect(wrapper.find('svg.action-check').exists()).toBe(true)
  })

  it('keeps an icon slot visible while idle and swaps it out for each phase', () => {
    const slots = { default: '<svg class="icon" />' }

    const idle = mount(ActionIndicator, { props: { phase: 'idle' }, slots })
    expect(idle.find('svg.icon').exists()).toBe(true)

    const doing = mount(ActionIndicator, { props: { phase: 'doing' }, slots })
    expect(doing.find('svg.icon').exists()).toBe(false)

    const done = mount(ActionIndicator, { props: { phase: 'done' }, slots })
    expect(done.find('svg.icon').exists()).toBe(false)
    expect(done.find('svg.action-check').exists()).toBe(true)
  })
})
