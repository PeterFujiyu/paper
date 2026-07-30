import { describe, expect, it } from 'vitest'

import {
  countWords,
  estimateReadingMinutes,
  formatReadingTime,
  MAX_READING_MINUTES,
  WORDS_PER_MINUTE,
} from '../../../src/shared/reading-time'

const words = (count: number): string => Array.from({ length: count }, () => 'word').join(' ')

describe('countWords', () => {
  it('counts whitespace-delimited words, ignoring padding and runs', () => {
    expect(countWords('  one   two\nthree\tfour ')).toBe(4)
  })

  it('is zero for empty and whitespace-only text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\t ')).toBe(0)
  })
})

describe('estimateReadingMinutes', () => {
  it('divides by the reading rate and rounds to the nearest minute', () => {
    expect(estimateReadingMinutes(words(WORDS_PER_MINUTE * 8))).toBe(8)
    // 8.4 minutes of words rounds down, 8.6 rounds up.
    expect(estimateReadingMinutes(words(WORDS_PER_MINUTE * 8 + 80))).toBe(8)
    expect(estimateReadingMinutes(words(WORDS_PER_MINUTE * 8 + 120))).toBe(9)
  })

  it('never returns a sub-minute estimate for a post that has words', () => {
    // Would round to 0 minutes; "0 min read" is noise.
    expect(estimateReadingMinutes(words(5))).toBe(1)
  })

  it('returns 0 for an empty body so the views can omit it entirely', () => {
    expect(estimateReadingMinutes('')).toBe(0)
    expect(estimateReadingMinutes('   ')).toBe(0)
  })

  it('caps a pathologically long body at the ceiling', () => {
    expect(estimateReadingMinutes(words(WORDS_PER_MINUTE * (MAX_READING_MINUTES + 500)))).toBe(
      MAX_READING_MINUTES
    )
  })
})

describe('formatReadingTime', () => {
  it('reads as a sentence fragment', () => {
    expect(formatReadingTime(1)).toBe('1 min read')
    expect(formatReadingTime(12)).toBe('12 min read')
  })

  it('is empty when there is nothing to show, so v-if can hide the whole span', () => {
    expect(formatReadingTime(0)).toBe('')
    expect(formatReadingTime(undefined)).toBe('')
  })
})
