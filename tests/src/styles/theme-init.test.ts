import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CURSOR_SIZES, DEFAULT_CURSOR_SIZE } from '../../../src/shared/cursor'

// public/theme-init.js is a hand-written copy of the preference reads in
// src/shared/theme.ts and src/shared/cursor.ts — it cannot import them, because a
// module script would be deferred and the flash it exists to prevent would come
// back. Nothing fails loudly if the copy drifts: the site simply paints the
// default palette for a frame, or ignores a stored choice entirely. These checks
// are the only thing holding the two in step.

const ROOT = process.cwd()
const bootstrap = readFileSync(join(ROOT, 'public/theme-init.js'), 'utf8')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const theme = readFileSync(join(ROOT, 'src/shared/theme.ts'), 'utf8')
const cursor = readFileSync(join(ROOT, 'src/shared/cursor.ts'), 'utf8')

/** A module's top-level string constants, keyed by constant name. */
function constants(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(/^const ([A-Z_]+) = '([^']+)'$/gm)].map((match) => [match[1], match[2]])
  )
}

const shared = { ...constants(theme), ...constants(cursor) }

describe('pre-paint appearance bootstrap', () => {
  it('loads synchronously and before any stylesheet, or it cannot beat the paint', () => {
    const tag = html.match(/<script[^>]*theme-init\.js[^>]*>/)
    expect(tag, 'index.html no longer loads /theme-init.js').not.toBeNull()
    expect(tag?.[0]).not.toMatch(/\bdefer\b|\basync\b|type="module"/)

    expect(html.indexOf('theme-init.js')).toBeLessThan(html.indexOf('rel="stylesheet"'))
  })

  it('reads every storage key and writes every class the shared modules define', () => {
    // A renamed key or class is the drift that matters: it fails silently, and the
    // stored choice is simply never found again. Both modules hold theirs in
    // top-level constants, so nothing has to be restated here.
    const required = Object.entries(shared).filter(([name]) => /_(KEY|CLASS)$/.test(name))
    expect(required.length).toBeGreaterThan(3)

    for (const [name, value] of required) {
      expect(bootstrap, `theme-init.js is missing ${name} ('${value}')`).toContain(`'${value}'`)
    }
  })

  it('compares against the same stored values the modules write', () => {
    // Only the "on" side of each pair. The bootstrap tests for dark / more /
    // native and lets everything else fall through, so LIGHT, NORMAL and THEMED
    // are deliberately absent from it.
    for (const name of ['DARK', 'MORE', 'NATIVE']) {
      expect(shared[name], `${name} is gone from the shared modules`).toBeDefined()
      expect(bootstrap, name).toContain(`'${shared[name]}'`)
    }
  })

  it('sets the cursor-size attribute for every size except the default', () => {
    for (const size of CURSOR_SIZES) {
      const mentioned = bootstrap.includes(`=== ${size}`)
      // The default is the unqualified block in cursors.css, so naming it in the
      // attribute would break the match rather than merely be redundant.
      expect(mentioned, `size ${size}`).toBe(size !== DEFAULT_CURSOR_SIZE)
    }
  })

  it('survives blocked storage, since that throws rather than returning null', () => {
    expect(bootstrap).toMatch(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/)
  })

  it('falls back to the OS preference behind both palette choices', () => {
    expect(bootstrap).toContain('(prefers-color-scheme: dark)')
    expect(bootstrap).toContain('(prefers-contrast: more)')
  })
})
