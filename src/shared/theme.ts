// Whether the site renders dark, and how far its greys sit from the ground —
// the two colour choices a visitor gets, plus the storage behind them. The
// `dark` and `high-contrast` classes on <html> are the only hooks
// src/style.css reads (`:root.dark` / `:root.high-contrast` override the colour
// tokens); this module owns those classes and the stored values.
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
  try {
    localStorage.setItem(THEME_KEY, dark ? DARK : LIGHT)
  } catch {
    // The choice just will not survive the session.
  }
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
  try {
    localStorage.setItem(CONTRAST_KEY, high ? MORE : NORMAL)
  } catch {
    // The choice just will not survive the session.
  }
}
