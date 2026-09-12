// The visitor's appearance choices — whether the site renders dark, how far its
// greys sit from the ground, whether the ornament is drawn, which typeface
// family it is set in, and whether the keyboard focus ring is drawn heavy — plus
// the storage behind them. The classes and the `data-font` attribute on <html>
// are the only hooks src/style.css reads (`:root.dark`, `:root.high-contrast`,
// `:root[data-font]` and so on override the tokens); this module owns those
// hooks and the stored values.
//
// Applied from src/main.ts before the app mounts rather than from a pre-paint
// inline <script>: the CSP has no 'unsafe-inline' in script-src, so an inline
// script in index.html would simply be blocked. Reading it in onMounted instead,
// as this once did, let a dark-mode visitor watch the first frame paint light and
// then flip — the flash was visible on every cold load.

const THEME_KEY = 'theme'
const DARK = 'dark'
const LIGHT = 'light'
const DARK_CLASS = 'dark'

const CONTRAST_KEY = 'contrast'
const MORE = 'more'
const NORMAL = 'normal'
const CONTRAST_CLASS = 'high-contrast'

const ARTWORK_KEY = 'artwork'
const LESS = 'less'
const FULL = 'full'
const ARTWORK_CLASS = 'less-artwork'

const FONT_KEY = 'font'

/**
 * The typeface choices, in the order the footer offers them. `default` is the
 * two-voice pairing (sans titles and chrome, serif reading); `sans` / `serif`
 * set every voice but code in one family; the `-all` pair move code as well.
 */
export const FONT_CHOICES = ['default', 'sans', 'sans-all', 'serif', 'serif-all'] as const

export type FontChoice = (typeof FONT_CHOICES)[number]

export const DEFAULT_FONT_CHOICE: FontChoice = 'default'

/** Value/label pairs for the footer's segmented control. */
export const FONT_CHOICE_OPTIONS: readonly { value: FontChoice; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'sans', label: 'Sans' },
  { value: 'sans-all', label: 'All sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'serif-all', label: 'All serif' },
]

const KEYBOARD_KEY = 'keyboard'
const ON = 'on'
const OFF = 'off'
const KEYBOARD_CLASS = 'keyboard-nav'

/**
 * Writes a choice, or does not: storage throws when the visitor has blocked
 * it, and then the choice simply will not survive the session. Every setter
 * below applies first and remembers second, so a refused write never costs
 * the visitor the change they just made.
 */
function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // The choice just will not survive the session.
  }
}

/** The visitor's stored choice, falling back to the OS preference. */
export function prefersDarkTheme(): boolean {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored) return stored === DARK
  } catch {
    // Storage throws when the visitor has blocked it; fall back to the OS.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Reflects the theme onto <html> without persisting it. */
export function applyDarkTheme(dark: boolean): void {
  document.documentElement.classList.toggle(DARK_CLASS, dark)
}

/** Records the choice and reflects it onto <html>. */
export function setDarkTheme(dark: boolean): void {
  applyDarkTheme(dark)
  remember(THEME_KEY, dark ? DARK : LIGHT)
}

/**
 * Whether to draw the higher-contrast palette, from the visitor's stored choice
 * and otherwise from the OS. `prefers-contrast: more` is the browser-level
 * request for exactly this, so a visitor who has already asked their system for
 * it gets it here without finding the footer control first.
 */
export function prefersHighContrast(): boolean {
  try {
    const stored = localStorage.getItem(CONTRAST_KEY)
    if (stored) return stored === MORE
  } catch {
    // Storage throws when the visitor has blocked it; fall back to the OS.
  }
  return window.matchMedia('(prefers-contrast: more)').matches
}

/** Reflects the contrast choice onto <html> without persisting it. */
export function applyHighContrast(high: boolean): void {
  document.documentElement.classList.toggle(CONTRAST_CLASS, high)
}

/** Records the contrast choice and reflects it onto <html>. */
export function setHighContrast(high: boolean): void {
  applyHighContrast(high)
  remember(CONTRAST_KEY, high ? MORE : NORMAL)
}

/**
 * Whether to drop the decorative drawings — the empty-state illustrations, the
 * section marks, the loading figure. Unlike the two palette choices this has no
 * OS preference behind it: `prefers-reduced-motion` asks about movement and the
 * artwork is static, `prefers-reduced-data` about bytes and it is inline SVG
 * measured in hundreds of them. Neither is the question being asked, so the
 * default is simply to draw, and only an explicit choice turns it off.
 */
export function prefersLessArtwork(): boolean {
  try {
    return localStorage.getItem(ARTWORK_KEY) === LESS
  } catch {
    // Storage throws when the visitor has blocked it; draw as normal.
    return false
  }
}

/** Reflects the artwork choice onto <html> without persisting it. */
export function applyLessArtwork(less: boolean): void {
  document.documentElement.classList.toggle(ARTWORK_CLASS, less)
}

/** Records the artwork choice and reflects it onto <html>. */
export function setLessArtwork(less: boolean): void {
  applyLessArtwork(less)
  remember(ARTWORK_KEY, less ? LESS : FULL)
}

function isFontChoice(value: string | null): value is FontChoice {
  return (FONT_CHOICES as readonly (string | null)[]).includes(value)
}

/**
 * The visitor's stored typeface choice. Like the artwork there is no OS
 * preference to fall back on — no media query asks about typeface — so an
 * unset, unknown or unreadable value is simply the default pairing.
 */
export function storedFontChoice(): FontChoice {
  try {
    const raw = localStorage.getItem(FONT_KEY)
    return isFontChoice(raw) ? raw : DEFAULT_FONT_CHOICE
  } catch {
    return DEFAULT_FONT_CHOICE
  }
}

/**
 * Reflects the typeface choice onto <html> without persisting it. The default
 * is the unqualified token block in src/style.css, so it wants no attribute at
 * all rather than an attribute naming it — the same rule as the cursor size.
 */
export function applyFontChoice(choice: FontChoice): void {
  const root = document.documentElement
  if (choice === DEFAULT_FONT_CHOICE) {
    delete root.dataset.font
  } else {
    root.dataset.font = choice
  }
}

/** Records the typeface choice and reflects it onto <html>. */
export function setFontChoice(choice: FontChoice): void {
  applyFontChoice(choice)
  remember(FONT_KEY, choice)
}

/**
 * Whether to draw the heavier focus ring. `true` / `false` is a choice the
 * visitor made in the footer; `null` means they have not said, and the shell
 * decides from behaviour instead — the first Tab press turns it on for the
 * session (see src/App.vue), which is the same signal the browser itself uses
 * for :focus-visible, so a pointer-only visitor never sees it.
 */
export function prefersKeyboardMode(): boolean | null {
  try {
    const stored = localStorage.getItem(KEYBOARD_KEY)
    if (stored === ON) return true
    if (stored === OFF) return false
  } catch {
    // Storage throws when the visitor has blocked it; behave as if unset.
  }
  return null
}

/** Reflects the keyboard choice onto <html> without persisting it. */
export function applyKeyboardMode(on: boolean): void {
  document.documentElement.classList.toggle(KEYBOARD_CLASS, on)
}

/** Records the keyboard choice and reflects it onto <html>. */
export function setKeyboardMode(on: boolean): void {
  applyKeyboardMode(on)
  remember(KEYBOARD_KEY, on ? ON : OFF)
}
