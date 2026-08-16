import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const { routeMeta } = vi.hoisted(() => ({ routeMeta: {} as { wide?: boolean } }))

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    name: 'RouterLink',
    props: { to: { type: [String, Object], default: '' }, ariaLabel: { type: String, default: '' } },
    setup: (_, { slots }) => () => h('a', slots.default?.()),
  }),
  RouterView: defineComponent({ name: 'RouterView', setup: () => () => h('div') }),
  // App reads `meta.wide` to widen the shell for reference views.
  useRoute: () => ({ meta: routeMeta }),
}))

vi.mock('../../src/shared/AppDialog.vue', () => ({
  default: defineComponent({ name: 'AppDialog', setup: () => () => h('div') }),
}))

import App from '../../src/App.vue'
import { CURSOR_SIZES, DEFAULT_CURSOR_SIZE } from '../../src/shared/cursor'

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
    document.documentElement.classList.remove('native-cursor')
    document.documentElement.classList.remove('dark')
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

describe('dark mode', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  // The whole point of resolving the preference during setup rather than in
  // onMounted: the very first render must already be dark, or the visitor
  // watches the light palette paint and then flip.
  it('renders dark on the first frame when dark is stored', () => {
    localStorage.setItem('theme', 'dark')

    const wrapper = mount(App)

    expect(wrapper.find('div').classes()).toContain('dark')
    expect(wrapper.find('.theme-toggle').attributes('aria-label')).toBe('Switch to light mode')
  })

  it('renders light on the first frame when light is stored', () => {
    localStorage.setItem('theme', 'light')

    const wrapper = mount(App)

    expect(wrapper.find('div').classes()).not.toContain('dark')
    expect(wrapper.find('.theme-toggle').attributes('aria-label')).toBe('Switch to dark mode')
  })

  it('toggling sets the class on <html> and persists the choice', async () => {
    localStorage.setItem('theme', 'light')
    const wrapper = mount(App)

    await wrapper.find('.theme-toggle').trigger('click')

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(wrapper.find('div').classes()).toContain('dark')

    await wrapper.find('.theme-toggle').trigger('click')

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
  })
})

describe('footer cursor setting', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('native-cursor')
    delete document.documentElement.dataset.cursorSize
  })

  it('keeps the settings panel collapsed until the toggle is pressed', async () => {
    const wrapper = mount(App)
    expect(wrapper.find('#footer-settings').exists()).toBe(false)
    expect(wrapper.find('.settings-toggle').attributes('aria-expanded')).toBe('false')

    await wrapper.find('.settings-toggle').trigger('click')

    expect(wrapper.find('#footer-settings').exists()).toBe(true)
    expect(wrapper.find('.settings-toggle').attributes('aria-expanded')).toBe('true')
  })

  it('defaults to the themed cursor when nothing is stored', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    expect(wrapper.find<HTMLInputElement>('.settings-row input[type="checkbox"]').element.checked).toBe(true)
    expect(document.documentElement.classList.contains('native-cursor')).toBe(false)
  })

  it('opting out sets the class and persists the choice', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')
    await wrapper.find('.settings-row input[type="checkbox"]').trigger('change')

    expect(document.documentElement.classList.contains('native-cursor')).toBe(true)
    expect(localStorage.getItem('cursor')).toBe('native')
  })

  it('opting back in clears the class and persists that too', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    const checkbox = wrapper.find('.settings-row input[type="checkbox"]')
    await checkbox.trigger('change')
    await checkbox.trigger('change')

    expect(document.documentElement.classList.contains('native-cursor')).toBe(false)
    expect(localStorage.getItem('cursor')).toBe('themed')
  })

  it('reflects a stored opt-out into the checkbox on mount', async () => {
    localStorage.setItem('cursor', 'native')

    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    expect(wrapper.find<HTMLInputElement>('.settings-row input[type="checkbox"]').element.checked).toBe(false)
  })

  it('credits the artwork inside the disclosure, not in the resting footer', async () => {
    const wrapper = mount(App)
    expect(wrapper.text()).not.toContain('Bibata')

    await wrapper.find('.settings-toggle').trigger('click')
    expect(wrapper.find('.settings-credit').text()).toContain('Bibata Modern Ice')
    expect(wrapper.find('.settings-credit').text()).toContain('GPL-3.0')
  })

  const sizeRadios = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll<HTMLInputElement>('.size-choice input[type="radio"]')

  const checkedSize = (wrapper: ReturnType<typeof mount>) =>
    sizeRadios(wrapper).find((radio) => radio.element.checked)?.element.value

  it('renders the sizes as a labelled radiogroup, not a native select', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    // A <select> would render in OS chrome, defeating both the type and the theme.
    expect(wrapper.find('select').exists()).toBe(false)

    const group = wrapper.find('.size-choice')
    expect(group.attributes('role')).toBe('radiogroup')
    expect(group.attributes('aria-labelledby')).toBe('cursor-size-label')
    expect(wrapper.find('#cursor-size-label').text()).toBe('Size')
  })

  it('offers every size, each label bound to its own input', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    expect(sizeRadios(wrapper).map((radio) => radio.element.value)).toEqual(CURSOR_SIZES.map(String))
    // Every label must point at a real input or clicking it does nothing.
    for (const label of wrapper.findAll('.size-option')) {
      expect(wrapper.find(`#${label.attributes('for')}`).exists()).toBe(true)
    }
  })

  it('starts on the default size with no attribute set', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    expect(checkedSize(wrapper)).toBe(String(DEFAULT_CURSOR_SIZE))
    // The default size is the unqualified CSS block, so it wants no attribute.
    expect(document.documentElement.dataset.cursorSize).toBeUndefined()
  })

  it('choosing a larger size sets the attribute and persists it', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    await wrapper.find('#cursor-size-48').trigger('change')

    expect(document.documentElement.dataset.cursorSize).toBe('48')
    expect(localStorage.getItem('cursorSize')).toBe('48')
    expect(checkedSize(wrapper)).toBe('48')
  })

  it('keeps the choice exclusive', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    await wrapper.find('#cursor-size-24').trigger('change')
    await wrapper.find('#cursor-size-64').trigger('change')

    expect(sizeRadios(wrapper).filter((radio) => radio.element.checked)).toHaveLength(1)
    expect(checkedSize(wrapper)).toBe('64')
  })

  it('returning to the default size removes the attribute again', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    await wrapper.find('#cursor-size-64').trigger('change')
    expect(document.documentElement.dataset.cursorSize).toBe('64')

    await wrapper.find(`#cursor-size-${DEFAULT_CURSOR_SIZE}`).trigger('change')
    expect(document.documentElement.dataset.cursorSize).toBeUndefined()
  })

  it('reflects a stored size into the choice card on mount', async () => {
    localStorage.setItem('cursorSize', '24')

    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    expect(checkedSize(wrapper)).toBe('24')
  })

  it('ignores a stored size that is not on offer', async () => {
    localStorage.setItem('cursorSize', '999')

    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    expect(checkedSize(wrapper)).toBe(String(DEFAULT_CURSOR_SIZE))
  })

  it('disables every size choice while the theme is off, since they would do nothing', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')
    expect(sizeRadios(wrapper).some((radio) => radio.element.disabled)).toBe(false)

    await wrapper.find('.settings-row input[type="checkbox"]').trigger('change')

    expect(sizeRadios(wrapper).every((radio) => radio.element.disabled)).toBe(true)
  })
})

describe('footer contrast setting', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('high-contrast')
    document.documentElement.classList.remove('dark')
  })

  it('defaults to the standard palette when nothing is stored', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    expect(wrapper.find<HTMLInputElement>('#setting-high-contrast').element.checked).toBe(false)
    expect(document.documentElement.classList.contains('high-contrast')).toBe(false)
  })

  it('opting in sets the class and persists the choice', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    await wrapper.find('#setting-high-contrast').trigger('change')

    expect(document.documentElement.classList.contains('high-contrast')).toBe(true)
    expect(localStorage.getItem('contrast')).toBe('more')
  })

  it('opting back out clears the class and persists that too', async () => {
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    const checkbox = wrapper.find('#setting-high-contrast')
    await checkbox.trigger('change')
    await checkbox.trigger('change')

    expect(document.documentElement.classList.contains('high-contrast')).toBe(false)
    expect(localStorage.getItem('contrast')).toBe('normal')
  })

  // Same reasoning as dark mode: the first render must already carry the class,
  // or the visitor watches the weaker palette paint and then flip.
  it('renders high contrast on the first frame when it is stored', () => {
    localStorage.setItem('contrast', 'more')

    const wrapper = mount(App)

    expect(wrapper.find('div').classes()).toContain('high-contrast')
  })

  it('reflects a stored opt-in into the checkbox on mount', async () => {
    localStorage.setItem('contrast', 'more')

    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    expect(wrapper.find<HTMLInputElement>('#setting-high-contrast').element.checked).toBe(true)
  })

  it('composes with dark mode rather than replacing it', async () => {
    localStorage.setItem('theme', 'dark')
    const wrapper = mount(App)
    await wrapper.find('.settings-toggle').trigger('click')

    await wrapper.find('#setting-high-contrast').trigger('change')

    expect(wrapper.find('div').classes()).toContain('dark')
    expect(wrapper.find('div').classes()).toContain('high-contrast')
  })
})

// The header and the content column are centred independently, so they only
// line up while they share a width. A route that widens one must widen both,
// which is why the flag lives on the shell rather than on .page-wrap.
describe('shell width', () => {
  afterEach(() => { delete routeMeta.wide })

  it('holds the shell to the reading measure by default', () => {
    const wrapper = mount(App)

    expect(wrapper.find('div').classes()).not.toContain('shell-wide')
  })

  it('widens the shell for a route that asks for it', () => {
    routeMeta.wide = true

    const wrapper = mount(App)

    expect(wrapper.find('div').classes()).toContain('shell-wide')
  })
})
