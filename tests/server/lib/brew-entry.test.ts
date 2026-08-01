import { describe, expect, it } from 'vitest'
import { buildSearchText, prepareBrew } from '../../../server/lib/brew-entry.js'
import { MAX_BEAN_LENGTH, MAX_TASTING_NOTE_LENGTH } from '../../../src/shared/brew.js'

const validBrew = {
  bean: 'Kochere',
  origin: 'Ethiopia',
  roaster: 'Passenger',
  method: 'V60',
  dose: 18,
  water: 300,
  temperature: 94,
  brewSeconds: 195,
  rating: 4,
  tastingNote: 'Jasmine up front, then a long lemon finish.',
  pairedSlug: 'on-the-em-dash',
}

describe('prepareBrew', () => {
  it('normalizes a complete brew', () => {
    const result = prepareBrew(validBrew)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      bean: 'Kochere',
      origin: 'Ethiopia',
      method: 'V60',
      dose: 18,
      water: 300,
      rating: 4,
      pairedSlug: 'on-the-em-dash',
    })
  })

  it('trims the text fields', () => {
    const result = prepareBrew({ ...validBrew, bean: '  Kochere  ', roaster: ' Passenger ' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.bean).toBe('Kochere')
    expect(result.value.roaster).toBe('Passenger')
  })

  it('requires a bean', () => {
    const result = prepareBrew({ ...validBrew, bean: '   ' })

    expect(result).toEqual({ ok: false, status: 400, error: 'Bean is required.' })
  })

  it('rejects a bean longer than the limit', () => {
    const result = prepareBrew({ ...validBrew, bean: 'a'.repeat(MAX_BEAN_LENGTH + 1) })

    expect(result.ok).toBe(false)
  })

  it('rejects a tasting note longer than the limit', () => {
    const result = prepareBrew({ ...validBrew, tastingNote: 'a'.repeat(MAX_TASTING_NOTE_LENGTH + 1) })

    expect(result.ok).toBe(false)
  })

  it('rejects a method outside the vocabulary', () => {
    const result = prepareBrew({ ...validBrew, method: 'Percolator' })

    expect(result).toEqual({ ok: false, status: 400, error: 'Choose a brew method.' })
  })

  // The method reaches a Mongoose enum, so an object here would otherwise be
  // handed straight to the query layer.
  it('rejects a non-string method', () => {
    expect(prepareBrew({ ...validBrew, method: { $ne: null } }).ok).toBe(false)
  })

  it('treats absent, null, and empty recipe figures as unrecorded', () => {
    const result = prepareBrew({
      bean: 'House blend',
      method: 'Espresso',
      dose: null,
      water: '',
      rating: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.dose).toBe(0)
    expect(result.value.water).toBe(0)
    expect(result.value.temperature).toBe(0)
    expect(result.value.brewSeconds).toBe(0)
    expect(result.value.rating).toBe(0)
  })

  it('rejects a recipe figure that is not a number', () => {
    const result = prepareBrew({ ...validBrew, dose: '18g' })

    expect(result).toEqual({ ok: false, status: 400, error: 'Dose must be a number.' })
  })

  it('rejects out-of-range figures', () => {
    expect(prepareBrew({ ...validBrew, dose: -1 }).ok).toBe(false)
    expect(prepareBrew({ ...validBrew, water: 99_999 }).ok).toBe(false)
    expect(prepareBrew({ ...validBrew, temperature: 150 }).ok).toBe(false)
    expect(prepareBrew({ ...validBrew, rating: 9 }).ok).toBe(false)
  })

  it('rejects a fractional rating', () => {
    const result = prepareBrew({ ...validBrew, rating: 3.5 })

    expect(result).toEqual({ ok: false, status: 400, error: 'Rating must be a whole number.' })
  })

  it('lowercases a paired slug and rejects one that is not a slug', () => {
    const upper = prepareBrew({ ...validBrew, pairedSlug: 'On-The-Em-Dash' })
    expect(upper.ok).toBe(true)
    if (upper.ok) expect(upper.value.pairedSlug).toBe('on-the-em-dash')

    expect(prepareBrew({ ...validBrew, pairedSlug: '../../etc/passwd' }).ok).toBe(false)
    expect(prepareBrew({ ...validBrew, pairedSlug: 'has spaces' }).ok).toBe(false)
  })

  it('accepts a brew with no paired essay', () => {
    const result = prepareBrew({ ...validBrew, pairedSlug: '' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.pairedSlug).toBe('')
  })

  it('builds a lowercased search projection over the readable fields', () => {
    const result = prepareBrew(validBrew)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.searchText).toBe(
      'kochere ethiopia passenger v60 jasmine up front, then a long lemon finish.'
    )
  })
})

describe('buildSearchText', () => {
  it('skips the fields that were left empty', () => {
    const text = buildSearchText({
      bean: 'House blend',
      origin: '',
      roaster: '',
      method: 'Espresso',
      dose: 18,
      water: 36,
      temperature: 0,
      brewSeconds: 0,
      rating: 0,
      tastingNote: '',
      pairedSlug: '',
    })

    expect(text).toBe('house blend espresso')
  })
})
