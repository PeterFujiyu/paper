import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { FONT_CHOICES } from '../../../src/shared/theme'

// The type preference is pure CSS: html[data-font] reassigns the --font-*
// voices to another --stack-*. Nothing in the app fails if a block goes
// missing or a component reaches past the voice to a literal stack — the
// reader's choice just quietly stops applying there. These checks hold the
// token layering, the per-choice overrides and the "voices only" rule in place.

const ROOT = process.cwd()
const css = readFileSync(join(ROOT, 'src/style.css'), 'utf8')

/** The declarations inside a top-level rule, as a token → value map. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} is missing from style.css`).toBeGreaterThan(-1)
  const block = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries(
    [...block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()])
  )
}

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return vueFiles(path)
    return name.endsWith('.vue') ? [path] : []
  })
}

describe('type voices', () => {
  const base = tokens(':root')

  it('routes every voice through a literal stack, so an override can never form a cycle', () => {
    for (const voice of ['serif', 'sans', 'mono']) {
      expect(base[`--stack-${voice}`], `--stack-${voice}`).toBeDefined()
      expect(base[`--font-${voice}`], `--font-${voice}`).toBe(`var(--stack-${voice})`)
    }
  })

  // What each choice moves. "sans"/"serif" leave code in mono; the "-all" pair
  // move it too. Nothing else may change, so size and spacing are untouched.
  const OVERRIDES: Record<string, Record<string, string>> = {
    sans: { '--font-serif': 'var(--stack-sans)' },
    'sans-all': { '--font-serif': 'var(--stack-sans)', '--font-mono': 'var(--stack-sans)' },
    serif: { '--font-sans': 'var(--stack-serif)' },
    'serif-all': { '--font-sans': 'var(--stack-serif)', '--font-mono': 'var(--stack-serif)' },
  }

  it('has an override block for every choice except the default, and reassigns exactly the voices it should', () => {
    for (const choice of FONT_CHOICES) {
      if (choice === 'default') {
        expect(css).not.toContain('[data-font="default"]')
        continue
      }
      expect(tokens(`:root[data-font="${choice}"]`)).toEqual(OVERRIDES[choice])
    }
  })

  it('moves code only for the "-all" choices', () => {
    for (const [choice, override] of Object.entries(OVERRIDES)) {
      expect('--font-mono' in override, choice).toBe(choice.endsWith('-all'))
    }
  })

  it('keeps every component on the voices rather than a literal stack', () => {
    // A hardcoded family is the one place a reader's choice would not reach —
    // the admin editor once did this and disagreed with the published essay.
    for (const file of vueFiles(join(ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/font-family:\s*["']?(Georgia|Montserrat|Times New Roman)/)
      expect(source, file).not.toContain('var(--stack-')
    }
  })
})

describe('keyboard mode and forced colours', () => {
  it('draws the heavier ring off the keyboard-nav class', () => {
    const start = css.indexOf(':root.keyboard-nav')
    expect(start).toBeGreaterThan(-1)
    const block = css.slice(start, css.indexOf('}', start))
    expect(block).toContain(':focus-visible')
    expect(block).toContain('outline-width: 3px')
  })

  it('carries a forced-colors layer, since neither contrast palette survives one', () => {
    expect(css).toContain('@media (forced-colors: active)')
    expect(css).not.toContain('forced-color-adjust: none')
  })
})
