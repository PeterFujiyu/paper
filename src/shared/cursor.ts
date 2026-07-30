// The visitor's control over the site's Bibata cursor theme: whether to use it at
// all, and how large to draw it. src/styles/cursors.css owns the artwork; this
// module owns only the two hooks that stylesheet reads — the `native-cursor`
// class and the `data-cursor-size` attribute on <html> — plus the stored values
// behind them.
//
// Both are applied from src/main.ts before the app mounts rather than from a
// pre-paint inline <script>: the CSP has no 'unsafe-inline' in script-src, so an
// inline script in index.html would simply be blocked.
//
// Size matters for more than taste. There is no media query for OS pointer-size
// settings, so a visitor who has enlarged their system cursor for a visual
// impairment silently loses that accommodation the moment we draw our own. This
// control, and the opt-out beside it, are the only mitigation available.

const ENABLED_KEY = 'cursor'
const NATIVE = 'native'
const THEMED = 'themed'
const NATIVE_CLASS = 'native-cursor'

const SIZE_KEY = 'cursorSize'

/** Sizes with generated blocks in cursors.css. Keep in step with SIZES there. */
export const CURSOR_SIZES = [24, 32, 48, 64] as const

export type CursorSize = (typeof CURSOR_SIZES)[number]

/** 32 matches the artwork's native 32pt, so it is the only crisp size at 1x. */
export const DEFAULT_CURSOR_SIZE: CursorSize = 32

/** Labels for the footer control, kept beside the sizes so the two cannot drift. */
export const CURSOR_SIZE_OPTIONS: readonly { value: CursorSize; label: string }[] = [
  { value: 24, label: 'Small' },
  { value: 32, label: 'Regular' },
  { value: 48, label: 'Large' },
  { value: 64, label: 'Extra large' },
]

function isCursorSize(value: number): value is CursorSize {
  return (CURSOR_SIZES as readonly number[]).includes(value)
}

/** True when the visitor has opted out. The theme is the default. */
export function prefersNativeCursor(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === NATIVE
  } catch {
    // Storage throws when the visitor has blocked it; fall back to the theme.
    return false
  }
}

/** Reflects the opt-out onto <html> without persisting it. */
export function applyNativeCursor(native: boolean): void {
  document.documentElement.classList.toggle(NATIVE_CLASS, native)
}

/** Records the opt-out and reflects it onto <html>. */
export function setNativeCursor(native: boolean): void {
  applyNativeCursor(native)
  try {
    localStorage.setItem(ENABLED_KEY, native ? NATIVE : THEMED)
  } catch {
    // The choice just will not survive the session.
  }
}

/** The stored size, falling back to the default for anything unrecognised. */
export function storedCursorSize(): CursorSize {
  try {
    const raw = Number(localStorage.getItem(SIZE_KEY))
    return isCursorSize(raw) ? raw : DEFAULT_CURSOR_SIZE
  } catch {
    return DEFAULT_CURSOR_SIZE
  }
}

/** Reflects the size onto <html> without persisting it. */
export function applyCursorSize(size: CursorSize): void {
  // The default size is the unqualified block in cursors.css, so it wants no
  // attribute at all rather than an attribute naming it.
  if (size === DEFAULT_CURSOR_SIZE) {
    delete document.documentElement.dataset.cursorSize
    return
  }
  document.documentElement.dataset.cursorSize = String(size)
}

/** Records the size and reflects it onto <html>. */
export function setCursorSize(size: CursorSize): void {
  applyCursorSize(size)
  try {
    localStorage.setItem(SIZE_KEY, String(size))
  } catch {
    // The choice just will not survive the session.
  }
}
