import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The high-contrast palette is pure CSS, so nothing in the app would fail if a
// token were dropped or a rule landed in the wrong place — the page would just
// keep painting the weaker grey. `:root.dark` and `:root.high-contrast` also
// carry identical specificity, which makes the source order load-bearing rather
// than cosmetic. These checks are what hold both of those in place.

const CSS_PATH = join(process.cwd(), 'src/style.css')
const css = readFileSync(CSS_PATH, 'utf8')

/** The declarations inside a top-level rule, as a token → value map. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} is missing from style.css`).toBeGreaterThan(-1)
  const block = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries(
    [...block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()])
  )
}

describe('high-contrast palette', () => {
  const base = tokens(':root')
  const dark = tokens(':root.dark')
  const contrast = tokens(':root.high-contrast')
  const darkContrast = tokens(':root.dark.high-contrast')

  // Muted text is the reason the mode exists; the rest keeps it coherent.
  const STRENGTHENED = ['--text-main', '--text-muted', '--border', '--accent-ink']

  it('strengthens the light greys rather than leaving them at the base value', () => {
    for (const token of STRENGTHENED) {
      expect(contrast[token], token).toBeDefined()
      expect(contrast[token], token).not.toBe(base[token])
    }
  })

  it('strengthens the dark greys too, since dark mode has its own muted grey', () => {
    for (const token of STRENGTHENED) {
      expect(darkContrast[token], token).toBeDefined()
      expect(darkContrast[token], token).not.toBe(dark[token] ?? base[token])
    }
  })

  it('re-declares every light override in the dark pairing', () => {
    // Equal specificity plus a later source position means :root.high-contrast
    // would otherwise leak its light values into a dark high-contrast page.
    for (const token of Object.keys(contrast)) {
      expect(darkContrast[token], `${token} leaks into dark high contrast`).toBeDefined()
    }
  })

  it('declares the contrast rules after the dark rule they override', () => {
    expect(css.indexOf(':root.high-contrast {')).toBeGreaterThan(css.indexOf(':root.dark {'))
    expect(css.indexOf(':root.dark.high-contrast {')).toBeGreaterThan(css.indexOf(':root.high-contrast {'))
  })
})

describe('wide-gamut accent', () => {
  const start = css.indexOf('@media (color-gamut: p3) {')
  const p3 = css.slice(start)
  const PALETTES = [':root', ':root.dark', ':root.high-contrast', ':root.dark.high-contrast']

  it('re-declares both accents for every palette', () => {
    expect(start, 'P3 block is missing from style.css').toBeGreaterThan(-1)
    for (const selector of PALETTES) {
      const at = p3.indexOf(`  ${selector} {`)
      expect(at, `${selector} is missing from the P3 block`).toBeGreaterThan(-1)
      const block = p3.slice(at, p3.indexOf('}', at))
      expect(block, selector).toMatch(/--accent:\s*color\(display-p3 /)
      expect(block, selector).toMatch(/--accent-ink:\s*color\(display-p3 /)
    }
  })

  it('comes after the sRGB palettes and keeps their order', () => {
    expect(start).toBeGreaterThan(css.indexOf(':root.dark.high-contrast {'))
    const order = PALETTES.map((selector) => p3.indexOf(`  ${selector} {`))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
})

describe('color-scheme', () => {
  it('tells the browser which palette native controls should use', () => {
    expect(css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))).toMatch(/color-scheme:\s*light;/)
    expect(css.slice(css.indexOf(':root.dark {'), css.indexOf('}', css.indexOf(':root.dark {')))).toMatch(/color-scheme:\s*dark;/)
  })
})
