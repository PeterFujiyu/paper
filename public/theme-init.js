// Pre-paint bootstrap for the visitor's stored appearance choices.
//
// src/main.ts applies the same five settings, but it is a module script: it does
// not run until its whole dependency graph has loaded, while the stylesheet is
// render-blocking and ready long before that. On a cold or throttled load a
// dark-mode or high-contrast visitor could still watch the default palette paint
// and then flip. This file is fetched and executed synchronously from <head>
// ahead of every stylesheet, so the classes are on <html> before the first paint.
//
// It is a separate file rather than an inline <script> because script-src in the
// CSP carries no 'unsafe-inline' (see server/lib/security.ts and vercel.json),
// which would block an inline block outright.
//
// The keys, class names and sizes below mirror src/shared/theme.ts and
// src/shared/cursor.ts. Those modules remain the source of truth — everything
// that reads or writes a preference goes through them, and src/main.ts still
// applies them as a fallback for a visitor who never receives this file.
// tests/src/styles/theme-init.test.ts fails if this copy drifts from them.
(function () {
  var root = document.documentElement

  function stored(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      // Storage throws when the visitor has blocked it; fall back to the OS.
      return null
    }
  }

  function asks(query) {
    return window.matchMedia(query).matches
  }

  var theme = stored('theme')
  root.classList.toggle('dark', theme ? theme === 'dark' : asks('(prefers-color-scheme: dark)'))

  var contrast = stored('contrast')
  root.classList.toggle(
    'high-contrast',
    contrast ? contrast === 'more' : asks('(prefers-contrast: more)')
  )

  // No OS query behind this one — see prefersLessArtwork in src/shared/theme.ts.
  root.classList.toggle('less-artwork', stored('artwork') === 'less')

  root.classList.toggle('native-cursor', stored('cursor') === 'native')

  // 32 is the default and the unqualified block in src/styles/cursors.css, so it
  // wants no attribute at all rather than an attribute naming it.
  var size = Number(stored('cursorSize'))
  if (size === 24 || size === 48 || size === 64) {
    root.dataset.cursorSize = String(size)
  }
})()
