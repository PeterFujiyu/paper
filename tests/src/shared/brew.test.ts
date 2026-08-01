import { describe, expect, it } from 'vitest'
import {
  brewTimeInput,
  doseShare,
  formatBrewTime,
  formatRatio,
  formatTemperature,
  isBrewMethod,
  parseBrewTime,
  pourOfTheHour,
} from '../../../src/shared/brew'

describe('formatRatio', () => {
  it('writes the ratio the way a recipe does', () => {
    expect(formatRatio(18, 300)).toBe('1:16.7')
    expect(formatRatio(18, 36)).toBe('1:2')
    expect(formatRatio(100, 800)).toBe('1:8')
  })

  it('is empty unless both figures are recorded', () => {
    expect(formatRatio(18, 0)).toBe('')
    expect(formatRatio(0, 300)).toBe('')
    expect(formatRatio(undefined, undefined)).toBe('')
  })
})

describe('doseShare', () => {
  it('reports the coffee’s share of the cup', () => {
    expect(doseShare(18, 36)).toBeCloseTo(1 / 3, 5)
    expect(doseShare(18, 300)).toBeCloseTo(18 / 318, 5)
  })

  it('is zero when either figure is missing', () => {
    expect(doseShare(0, 300)).toBe(0)
    expect(doseShare(18, 0)).toBe(0)
  })
})

describe('formatBrewTime', () => {
  it('writes minutes and seconds', () => {
    expect(formatBrewTime(195)).toBe('3:15')
    expect(formatBrewTime(45)).toBe('0:45')
    expect(formatBrewTime(600)).toBe('10:00')
  })

  it('switches to hours once minutes stop being useful', () => {
    expect(formatBrewTime(64_800)).toBe('18 h')
    expect(formatBrewTime(5400)).toBe('1.5 h')
  })

  it('is empty when unrecorded', () => {
    expect(formatBrewTime(0)).toBe('')
    expect(formatBrewTime(undefined)).toBe('')
  })
})

describe('parseBrewTime', () => {
  it('reads mm:ss, h:mm:ss, and bare seconds', () => {
    expect(parseBrewTime('3:15')).toBe(195)
    expect(parseBrewTime('0:45')).toBe(45)
    expect(parseBrewTime('18:00:00')).toBe(64_800)
    expect(parseBrewTime('195')).toBe(195)
  })

  it('treats empty as unrecorded rather than invalid', () => {
    expect(parseBrewTime('')).toBe(0)
    expect(parseBrewTime('   ')).toBe(0)
  })

  it('rejects input that is not a time', () => {
    expect(parseBrewTime('three minutes')).toBeNull()
    expect(parseBrewTime('3:15:00:00')).toBeNull()
    expect(parseBrewTime('3:5')).toBeNull()   // seconds must be a full slot
    expect(parseBrewTime('3:75')).toBeNull()  // and within range
    expect(parseBrewTime('-90')).toBeNull()
  })

  it('rejects a time past the stored ceiling', () => {
    expect(parseBrewTime('25:00:00')).toBeNull()
  })

  it('round-trips through brewTimeInput', () => {
    for (const seconds of [45, 195, 600, 5400, 64_800]) {
      expect(parseBrewTime(brewTimeInput(seconds))).toBe(seconds)
    }
    expect(brewTimeInput(0)).toBe('')
  })
})

describe('formatTemperature', () => {
  it('rounds to a whole degree', () => {
    expect(formatTemperature(94)).toBe('94°')
    expect(formatTemperature(93.6)).toBe('94°')
  })

  it('is empty when unrecorded, which 0 means here too', () => {
    expect(formatTemperature(undefined)).toBe('')
    expect(formatTemperature(0)).toBe('')
  })
})

describe('isBrewMethod', () => {
  it('accepts only the known vocabulary', () => {
    expect(isBrewMethod('V60')).toBe(true)
    expect(isBrewMethod('Percolator')).toBe(false)
    expect(isBrewMethod(null)).toBe(false)
    expect(isBrewMethod({ $ne: null })).toBe(false)
  })
})

describe('pourOfTheHour', () => {
  it('gives every hour of the day a line', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(pourOfTheHour(hour)).not.toBe('')
    }
  })

  // The point of the line is that a later visit reads differently.
  it('changes across the day', () => {
    const lines = new Set([0, 6, 9, 12, 16, 19, 22].map(pourOfTheHour))
    expect(lines.size).toBe(7)
  })
})
