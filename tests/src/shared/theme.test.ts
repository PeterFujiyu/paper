import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_FONT_CHOICE,
  FONT_CHOICES,
  FONT_CHOICE_OPTIONS,
  applyDarkTheme,
  applyFontChoice,
  applyHighContrast,
  applyKeyboardMode,
  prefersDarkTheme,
  prefersHighContrast,
  prefersKeyboardMode,
  setDarkTheme,
  setFontChoice,
  setHighContrast,
  setKeyboardMode,
  storedFontChoice,
} from '../../../src/shared/theme'

function stubMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn(() =>
    ({ matches, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
  )
}

describe('theme preference', () => {
  const realMatchMedia = window.matchMedia

  beforeEach(() => {
    stubMatchMedia(false)
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    window.matchMedia = realMatchMedia
  })

  it('follows the OS preference when nothing is stored', () => {
    stubMatchMedia(true)
    expect(prefersDarkTheme()).toBe(true)

    stubMatchMedia(false)
    expect(prefersDarkTheme()).toBe(false)
  })

  it('lets a stored choice override the OS preference in both directions', () => {
    stubMatchMedia(true)
    localStorage.setItem('theme', 'light')
    expect(prefersDarkTheme()).toBe(false)

    stubMatchMedia(false)
    localStorage.setItem('theme', 'dark')
    expect(prefersDarkTheme()).toBe(true)
  })

  it('falls back to the OS preference when storage is blocked', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    stubMatchMedia(true)

    expect(prefersDarkTheme()).toBe(true)

    getItem.mockRestore()
  })

  it('toggles the class on <html>, which is what the token overrides key off', () => {
    applyDarkTheme(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    applyDarkTheme(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applies and persists in one step', () => {
    setDarkTheme(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')

    setDarkTheme(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('still applies the theme when storage refuses the write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => setDarkTheme(true)).not.toThrow()
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    setItem.mockRestore()
  })
})

describe('contrast preference', () => {
  const realMatchMedia = window.matchMedia

  beforeEach(() => {
    stubMatchMedia(false)
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('high-contrast')
    window.matchMedia = realMatchMedia
  })

  // A visitor who already asked their OS for more contrast should not have to
  // find the footer control to get it.
  it('follows prefers-contrast when nothing is stored', () => {
    stubMatchMedia(true)
    expect(prefersHighContrast()).toBe(true)

    stubMatchMedia(false)
    expect(prefersHighContrast()).toBe(false)
  })

  it('lets a stored choice override the OS preference in both directions', () => {
    stubMatchMedia(true)
    localStorage.setItem('contrast', 'normal')
    expect(prefersHighContrast()).toBe(false)

    stubMatchMedia(false)
    localStorage.setItem('contrast', 'more')
    expect(prefersHighContrast()).toBe(true)
  })

  it('falls back to the OS preference when storage is blocked', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    stubMatchMedia(true)

    expect(prefersHighContrast()).toBe(true)

    getItem.mockRestore()
  })

  it('toggles the class on <html>, which is what the token overrides key off', () => {
    applyHighContrast(true)
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true)

    applyHighContrast(false)
    expect(document.documentElement.classList.contains('high-contrast')).toBe(false)
  })

  it('applies and persists in one step', () => {
    setHighContrast(true)
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true)
    expect(localStorage.getItem('contrast')).toBe('more')

    setHighContrast(false)
    expect(document.documentElement.classList.contains('high-contrast')).toBe(false)
    expect(localStorage.getItem('contrast')).toBe('normal')
  })

  it('still applies the contrast choice when storage refuses the write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => setHighContrast(true)).not.toThrow()
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true)

    setItem.mockRestore()
  })

  // The two classes are independent: dark is a mood, contrast is an accommodation.
  it('is independent of the dark-mode class', () => {
    setDarkTheme(true)
    setHighContrast(true)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true)

    setHighContrast(false)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    document.documentElement.classList.remove('dark')
  })
})

describe('type preference', () => {
  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.font
  })

  it('offers a label for every choice, in the same order', () => {
    expect(FONT_CHOICE_OPTIONS.map((option) => option.value)).toEqual([...FONT_CHOICES])
    for (const option of FONT_CHOICE_OPTIONS) expect(option.label).not.toBe('')
  })

  // No media query asks about typeface, so there is no OS value to fall back to.
  it('is the default pairing when nothing, something unknown, or nothing readable is stored', () => {
    expect(storedFontChoice()).toBe(DEFAULT_FONT_CHOICE)

    localStorage.setItem('font', 'comic')
    expect(storedFontChoice()).toBe(DEFAULT_FONT_CHOICE)

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(storedFontChoice()).toBe(DEFAULT_FONT_CHOICE)
    getItem.mockRestore()
  })

  it('returns a stored choice that is on offer', () => {
    for (const choice of FONT_CHOICES) {
      localStorage.setItem('font', choice)
      expect(storedFontChoice()).toBe(choice)
    }
  })

  it('sets the attribute the token overrides key off, and none for the default', () => {
    applyFontChoice('serif-all')
    expect(document.documentElement.dataset.font).toBe('serif-all')

    applyFontChoice(DEFAULT_FONT_CHOICE)
    expect(document.documentElement.dataset.font).toBeUndefined()
  })

  it('applies and persists in one step', () => {
    setFontChoice('sans')
    expect(document.documentElement.dataset.font).toBe('sans')
    expect(localStorage.getItem('font')).toBe('sans')
  })

  it('still applies the choice when storage refuses the write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => setFontChoice('serif')).not.toThrow()
    expect(document.documentElement.dataset.font).toBe('serif')

    setItem.mockRestore()
  })
})

describe('keyboard preference', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('keyboard-nav')
  })

  // Unset is a third state: the shell decides from the first Tab press instead.
  it('is undecided when nothing is stored', () => {
    expect(prefersKeyboardMode()).toBeNull()
  })

  it('reports a stored choice in both directions', () => {
    localStorage.setItem('keyboard', 'on')
    expect(prefersKeyboardMode()).toBe(true)

    localStorage.setItem('keyboard', 'off')
    expect(prefersKeyboardMode()).toBe(false)
  })

  it('is undecided when storage is blocked', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(prefersKeyboardMode()).toBeNull()

    getItem.mockRestore()
  })

  it('toggles the class on <html>, which is what the ring rule keys off', () => {
    applyKeyboardMode(true)
    expect(document.documentElement.classList.contains('keyboard-nav')).toBe(true)

    applyKeyboardMode(false)
    expect(document.documentElement.classList.contains('keyboard-nav')).toBe(false)
  })

  it('applies and persists in one step', () => {
    setKeyboardMode(true)
    expect(document.documentElement.classList.contains('keyboard-nav')).toBe(true)
    expect(localStorage.getItem('keyboard')).toBe('on')

    setKeyboardMode(false)
    expect(document.documentElement.classList.contains('keyboard-nav')).toBe(false)
    expect(localStorage.getItem('keyboard')).toBe('off')
  })

  it('still applies the choice when storage refuses the write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => setKeyboardMode(true)).not.toThrow()
    expect(document.documentElement.classList.contains('keyboard-nav')).toBe(true)

    setItem.mockRestore()
  })
})
