import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The pinned table header is pure CSS in PostView's unscoped `.prose` block, so
// no component test would notice if the rule were dropped or if a later edit
// put the table back on collapsed borders — which silently strands the pinned
// row's hairlines. These checks hold the three load-bearing declarations.

const css = readFileSync(join(process.cwd(), 'src/views/PostView.vue'), 'utf8')

/** The declarations of the first rule whose selector list ends with `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} is missing from PostView.vue`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('}', start))
}

describe('essay table header row', () => {
  it('pins beneath the site header while the body scrolls past', () => {
    const header = rule('.prose tr:first-child th')
    expect(header).toMatch(/position:\s*sticky/)
    expect(header).toMatch(/top:\s*var\(--header-h\)/)
  })

  it('keeps borders on the cells so they travel with the pinned row', () => {
    expect(rule('.prose table')).toMatch(/border-collapse:\s*separate/)
    expect(rule('.prose td')).toMatch(/border-bottom:\s*1px solid var\(--border\)/)
  })

  it('tints the header opaquely so scrolled rows do not show through', () => {
    const tint = rule('.prose th').match(/background:\s*([^;]+);/)?.[1] ?? ''
    expect(tint).toContain('color-mix(')
    expect(tint).not.toContain('transparent')
    // Both mix percentages present would have to sum to 100 for full opacity;
    // a single percentage lets color-mix fill the remainder.
    expect(tint.match(/\d+%/g)?.length).toBe(1)
  })
})
