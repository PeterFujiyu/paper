import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyDarkTheme,
  applyHighContrast,
  prefersDarkTheme,
  prefersHighContrast,
  setDarkTheme,
  setHighContrast,
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
