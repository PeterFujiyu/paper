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
