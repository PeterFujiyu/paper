import { describe, expect, it } from 'vitest'

import { extractPlainText } from '../../../server/lib/content-text.js'

describe('extractPlainText', () => {
  it('flattens nested TipTap nodes into a single spaced string', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'On Craft' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'The overlooked' },
            { type: 'text', text: 'details', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    }

    expect(extractPlainText(doc)).toBe('On Craft The overlooked details')
  })

  it('collapses whitespace and trims', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '  spaced   out  ' }] }],
    }

    expect(extractPlainText(doc)).toBe('spaced out')
  })

  it('returns an empty string for null or textless content', () => {
    expect(extractPlainText(null)).toBe('')
    expect(extractPlainText({ type: 'doc', content: [] })).toBe('')
    expect(extractPlainText({ type: 'image', attrs: { src: 'x.png' } })).toBe('')
  })
})
