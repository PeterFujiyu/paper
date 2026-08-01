// Brew vocabulary and formatting, shared by the write path (validation) and the
// views (display). Lives here rather than in server/lib so the frontend can
// import it without reaching into server code — the same arrangement as
// src/shared/reading-time.ts.

/**
 * The methods a cup can be made by. Ordered roughly from shortest ratio to
 * longest, which is also the order the admin dropdown offers them in.
 */
export const BREW_METHODS = [
  'Espresso',
  'Moka',
  'AeroPress',
  'V60',
  'Chemex',
  'French press',
  'Siphon',
  'Cold brew',
] as const

export type BrewMethod = (typeof BREW_METHODS)[number]

export const MAX_BEAN_LENGTH = 80
export const MAX_ORIGIN_LENGTH = 60
export const MAX_ROASTER_LENGTH = 60
export const MAX_TASTING_NOTE_LENGTH = 400

/** Grams of dry coffee. The ceiling is well past any single cup. */
export const MAX_DOSE_GRAMS = 200
/** Grams of water. Generous enough for a cold-brew batch. */
export const MAX_WATER_GRAMS = 5000
/** Celsius. Below freezing is cold brew's business; above boiling is nobody's. */
export const MIN_TEMPERATURE_C = 0
export const MAX_TEMPERATURE_C = 100
/** Seconds. Cold brew runs long — 24 hours is the cap. */
export const MAX_BREW_SECONDS = 86_400
export const MAX_RATING = 5

export function isBrewMethod(value: unknown): value is BrewMethod {
  return typeof value === 'string' && (BREW_METHODS as readonly string[]).includes(value)
}

/**
 * Brew ratio in the form coffee people write it: "1:16.7", or "1:2" for an
 * espresso. Empty when either figure is missing, since a ratio needs both.
 */
export function formatRatio(dose?: number, water?: number): string {
  if (!dose || !water) return ''
  const ratio = water / dose
  if (!Number.isFinite(ratio) || ratio <= 0) return ''
  // One decimal, but a whole number stays whole — "1:2", not "1:2.0".
  const rounded = Math.round(ratio * 10) / 10
  return `1:${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}`
}

/**
 * The share of the cup that is dry coffee, 0–1. Drives the proportion mark in
 * the list: an espresso reads as a third of the rail, a cold brew as a sliver.
 */
export function doseShare(dose?: number, water?: number): number {
  if (!dose || !water) return 0
  const share = dose / (dose + water)
  return Number.isFinite(share) ? Math.min(Math.max(share, 0), 1) : 0
}

/** Brew time as "3:15". Sub-minute times keep the leading "0:". */
export function formatBrewTime(seconds?: number): string {
  if (!seconds || seconds < 1) return ''
  // Past an hour, minutes stop being the useful unit — cold brew is "18 h".
  if (seconds >= 3600) {
    const hours = Math.round((seconds / 3600) * 10) / 10
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`
  }
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * Reads a brew time the way a person would write one: "3:15", "1:30:00", or a
 * bare count of seconds. Returns 0 for empty (the stored "unrecorded"), or null
 * when the input isn't a time at all, so the form can say so rather than
 * silently logging a wrong number.
 */
export function parseBrewTime(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return 0

  const parts = trimmed.split(':')
  if (parts.length > 3) return null

  // Only the leading part may exceed two digits ("90:00" is ninety minutes);
  // every following part is a 0-59 sexagesimal slot.
  for (let i = 0; i < parts.length; i += 1) {
    if (!/^\d+$/.test(parts[i])) return null
    if (i > 0 && (parts[i].length !== 2 || Number(parts[i]) > 59)) return null
  }

  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0)
  if (!Number.isFinite(seconds) || seconds > MAX_BREW_SECONDS) return null
  return seconds
}

/** The editable form of a stored brew time — the inverse of parseBrewTime. */
export function brewTimeInput(seconds?: number): string {
  if (!seconds || seconds < 1) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * Water temperature as "94°". Empty when unrecorded — which, as everywhere else
 * on a brew, is what 0 means. The cost is that a literal 0°C can't be recorded;
 * the pour that needs it doesn't exist, and cold brew logs its fridge at 4°.
 */
export function formatTemperature(celsius?: number): string {
  if (!celsius || !Number.isFinite(celsius)) return ''
  return `${Math.round(celsius)}°`
}

/**
 * The line above the Coffee Time list, chosen by the reader's own clock. The
 * section is a standing invitation rather than a feed, so this is what makes a
 * second visit feel different from the first — the page greets the hour it is
 * actually opened in.
 */
export function pourOfTheHour(hour: number): string {
  if (hour < 5) return 'Small hours. Whatever is in the pot is decaf by now.'
  if (hour < 8) return 'First pour of the day, and the good beans.'
  if (hour < 11) return 'The morning cup, taken slowly.'
  if (hour < 14) return 'Second cup. This is the one that does the work.'
  if (hour < 17) return 'Afternoon light, and something lighter in the cup.'
  if (hour < 21) return 'Past the hour for caffeine, which has never stopped anyone.'
  return 'Late. A short one, for the last paragraph.'
}
