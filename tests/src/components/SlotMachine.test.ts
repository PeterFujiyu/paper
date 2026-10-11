import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import SlotMachine from '../../../src/components/SlotMachine.vue'

/** The glyph each reel shows, read back from which dots are visible. */
function visibleDotCount(wrapper: ReturnType<typeof mount>): number {
  return wrapper.findAll('.slot-lights circle').filter(c => c.attributes('style') !== 'display: none;').length
}

function stubReducedMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
}

describe('SlotMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('rests on 404 with no coins out', () => {
    const wrapper = mount(SlotMachine)
    expect(wrapper.findAll('.slot-coin')).toHaveLength(0)
    expect(wrapper.find('.slot-lever--pulled').exists()).toBe(false)
  })

  it('pulls the lever, spins, settles back on 404 and pays out', async () => {
    stubReducedMotion(false)
    const wrapper = mount(SlotMachine)
    const resting = visibleDotCount(wrapper)

    await wrapper.trigger('click')
    expect(wrapper.find('.slot-lever--pulled').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(600)
    expect(wrapper.find('.slot-lever--pulled').exists()).toBe(false)
    expect(wrapper.findAll('.slot-dot--rolling').length).toBeGreaterThan(0)

    await vi.advanceTimersByTimeAsync(1200)
    expect(wrapper.findAll('.slot-dot--rolling')).toHaveLength(0)
    expect(visibleDotCount(wrapper)).toBe(resting)
    expect(wrapper.findAll('.slot-coin')).toHaveLength(7)

    await vi.advanceTimersByTimeAsync(4000)
    expect(wrapper.findAll('.slot-coin')).toHaveLength(0)
  })

  it('swings the lever forward along the side panel and back', async () => {
    stubReducedMotion(false)
    const wrapper = mount(SlotMachine)
    const knobX = (): number => Number(wrapper.find('.slot-lever circle').attributes('cx'))
    const restX = knobX()

    await wrapper.trigger('click')
    await vi.advanceTimersByTimeAsync(250)
    // Forward is toward the reader: down and to the left on screen, never right.
    expect(knobX()).toBeLessThan(restX - 20)

    await vi.advanceTimersByTimeAsync(1000)
    expect(knobX()).toBeCloseTo(restX, 1)
  })

  it('clears the last payout when pulled again', async () => {
    stubReducedMotion(false)
    const wrapper = mount(SlotMachine)
    await wrapper.trigger('click')
    // Past the last landing (~2940ms), but before the payout fades.
    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.findAll('.slot-coin')).toHaveLength(7)

    await wrapper.trigger('click')
    expect(wrapper.findAll('.slot-coin')).toHaveLength(0)
  })

  it('spends the coins on the base when pulled and returns them after the payout', async () => {
    stubReducedMotion(false)
    const wrapper = mount(SlotMachine)
    expect(wrapper.findAll('.slot-stake')).toHaveLength(5)
    expect(wrapper.findAll('.slot-stake--spent')).toHaveLength(0)

    await wrapper.trigger('click')
    expect(wrapper.findAll('.slot-stake--spent')).toHaveLength(5)

    await vi.advanceTimersByTimeAsync(2300)
    expect(wrapper.findAll('.slot-stake--spent')).toHaveLength(5)

    await vi.advanceTimersByTimeAsync(4000)
    expect(wrapper.findAll('.slot-coin')).toHaveLength(0)
    expect(wrapper.findAll('.slot-stake--spent')).toHaveLength(0)
  })

  it('stays busy until the last coin lands', async () => {
    stubReducedMotion(false)
    const wrapper = mount(SlotMachine)
    await wrapper.trigger('click')
    await vi.advanceTimersByTimeAsync(2500)
    expect(wrapper.classes()).toContain('slot-machine--busy')
    await wrapper.trigger('click')
    expect(wrapper.findAll('.slot-coin')).toHaveLength(7)

    await vi.advanceTimersByTimeAsync(500)
    expect(wrapper.classes()).not.toContain('slot-machine--busy')
  })

  it('holds reduced-motion coins still and visible rather than animating them', () => {
    // The sitewide reduce-motion rule collapses every animation to its last frame,
    // which for coin-fade is opacity 0. happy-dom cannot see that, so pin the CSS.
    const source = readFileSync(join(process.cwd(), 'src/components/SlotMachine.vue'), 'utf8')
    const reduced = source.slice(source.lastIndexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.slot-coin \{\s*animation: none;\s*opacity: 1;/)
  })

  it('ignores a second pull while the reels are still turning', async () => {
    stubReducedMotion(false)
    const wrapper = mount(SlotMachine)
    await wrapper.trigger('click')
    await vi.advanceTimersByTimeAsync(400)
    await wrapper.trigger('click')
    expect(wrapper.find('.slot-lever--pulled').exists()).toBe(false)
  })

  it('skips the spin under reduced motion and just pays out', async () => {
    stubReducedMotion(true)
    const wrapper = mount(SlotMachine)
    await wrapper.trigger('click')
    expect(wrapper.find('.slot-lever--pulled').exists()).toBe(false)
    expect(wrapper.findAll('.slot-dot--rolling')).toHaveLength(0)
    expect(wrapper.findAll('.slot-coin')).toHaveLength(7)
  })

  it('stops its timers when unmounted mid-spin', async () => {
    stubReducedMotion(false)
    const wrapper = mount(SlotMachine)
    await wrapper.trigger('click')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
