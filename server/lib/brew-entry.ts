import {
  isBrewMethod,
  MAX_BEAN_LENGTH,
  MAX_BREW_SECONDS,
  MAX_DOSE_GRAMS,
  MAX_ORIGIN_LENGTH,
  MAX_RATING,
  MAX_ROASTER_LENGTH,
  MAX_TASTING_NOTE_LENGTH,
  MAX_TEMPERATURE_C,
  MAX_WATER_GRAMS,
  MIN_TEMPERATURE_C,
  type BrewMethod,
} from '../../src/shared/brew.js'

export type BrewBody = {
  bean?: unknown
  origin?: unknown
  roaster?: unknown
  method?: unknown
  dose?: unknown
  water?: unknown
  temperature?: unknown
  brewSeconds?: unknown
  rating?: unknown
  tastingNote?: unknown
  pairedSlug?: unknown
}

/** A brew as it is stored: every field normalized, 0 standing in for "unrecorded". */
export type NormalizedBrew = {
  bean: string
  origin: string
  roaster: string
  method: BrewMethod
  dose: number
  water: number
  temperature: number
  brewSeconds: number
  rating: number
  tastingNote: string
  pairedSlug: string
  searchText: string
}

export type PreparedBrew =
  | { ok: true; value: NormalizedBrew }
  | { ok: false; status: number; error: string }

// Same shape as src/shared/slug.ts produces, and as validatePostBody enforces —
// a paired slug has to be able to address a real essay URL.
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * An optional numeric field. Absent, null, and empty string all mean "not
 * recorded" and normalize to 0; anything else has to be a real number in range,
 * so a typo in the admin form is rejected rather than silently dropped.
 */
function readNumber(
  value: unknown,
  label: string,
  min: number,
  max: number
): { ok: true; value: number } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, value: 0 }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, error: `${label} must be a number.` }
  }
  if (value < min || value > max) {
    return { ok: false, error: `${label} must be between ${min} and ${max}.` }
  }
  return { ok: true, value }
}

/**
 * Validate and normalize a brew for create/update. Shared by the brews create
 * and brew update handlers so both apply identical rules.
 *
 * Every string here is stored as plain text and rendered as plain text — brews
 * carry no rich content, so there is no TipTap sanitizer in this path and no
 * field on a brew is ever interpolated as markup.
 */
export function prepareBrew(body: BrewBody): PreparedBrew {
  const bean = readString(body.bean)
  if (!bean) return { ok: false, status: 400, error: 'Bean is required.' }
  if (bean.length > MAX_BEAN_LENGTH) {
    return { ok: false, status: 400, error: `Bean must be ${MAX_BEAN_LENGTH} characters or fewer.` }
  }

  if (!isBrewMethod(body.method)) {
    return { ok: false, status: 400, error: 'Choose a brew method.' }
  }
  const method = body.method

  const origin = readString(body.origin)
  if (origin.length > MAX_ORIGIN_LENGTH) {
    return { ok: false, status: 400, error: `Origin must be ${MAX_ORIGIN_LENGTH} characters or fewer.` }
  }

  const roaster = readString(body.roaster)
  if (roaster.length > MAX_ROASTER_LENGTH) {
    return { ok: false, status: 400, error: `Roaster must be ${MAX_ROASTER_LENGTH} characters or fewer.` }
  }

  const tastingNote = readString(body.tastingNote)
  if (tastingNote.length > MAX_TASTING_NOTE_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Tasting note must be ${MAX_TASTING_NOTE_LENGTH} characters or fewer.`,
    }
  }

  const dose = readNumber(body.dose, 'Dose', 0, MAX_DOSE_GRAMS)
  if (!dose.ok) return { ok: false, status: 400, error: dose.error }

  const water = readNumber(body.water, 'Water', 0, MAX_WATER_GRAMS)
  if (!water.ok) return { ok: false, status: 400, error: water.error }

  const temperature = readNumber(body.temperature, 'Temperature', MIN_TEMPERATURE_C, MAX_TEMPERATURE_C)
  if (!temperature.ok) return { ok: false, status: 400, error: temperature.error }

  const brewSeconds = readNumber(body.brewSeconds, 'Brew time', 0, MAX_BREW_SECONDS)
  if (!brewSeconds.ok) return { ok: false, status: 400, error: brewSeconds.error }

  const rating = readNumber(body.rating, 'Rating', 0, MAX_RATING)
  if (!rating.ok) return { ok: false, status: 400, error: rating.error }
  if (!Number.isInteger(rating.value)) {
    return { ok: false, status: 400, error: 'Rating must be a whole number.' }
  }

  const pairedSlug = readString(body.pairedSlug).toLowerCase()
  if (pairedSlug && !slugPattern.test(pairedSlug)) {
    return {
      ok: false,
      status: 400,
      error: 'Paired essay must be a slug of lowercase letters, numbers, and hyphens.',
    }
  }

  const value: NormalizedBrew = {
    bean,
    origin,
    roaster,
    method,
    dose: dose.value,
    water: water.value,
    temperature: temperature.value,
    brewSeconds: brewSeconds.value,
    rating: rating.value,
    tastingNote,
    pairedSlug,
    searchText: '',
  }

  return { ok: true, value: { ...value, searchText: buildSearchText(value) } }
}

/**
 * The lowercased haystack behind the section's search field. Method is included
 * so "aeropress" finds every cup made in one, and origin so "ethiopia" finds a
 * whole shelf.
 */
export function buildSearchText(brew: Omit<NormalizedBrew, 'searchText'>): string {
  return [brew.bean, brew.origin, brew.roaster, brew.method, brew.tastingNote]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
