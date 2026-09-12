import { createApp } from 'vue'
import './style.css'
import './styles/cursors.css'
import App from './App.vue'
import router from './router'
import { applyCursorSize, applyNativeCursor, prefersNativeCursor, storedCursorSize } from './shared/cursor'
import {
  applyDarkTheme,
  applyFontChoice,
  applyHighContrast,
  applyKeyboardMode,
  applyLessArtwork,
  prefersDarkTheme,
  prefersHighContrast,
  prefersKeyboardMode,
  prefersLessArtwork,
  storedFontChoice,
} from './shared/theme'

// public/theme-init.js has normally already done this, synchronously and ahead of
// the stylesheet — that, and not this, is what keeps the default palette from
// painting for a frame. These calls are the fallback for a visitor who never
// receives that file, and they still run before the first render, so anything
// they do fix is fixed without a flash. Reading them in onMounted would be too
// late for either path.
applyNativeCursor(prefersNativeCursor())
applyCursorSize(storedCursorSize())
applyDarkTheme(prefersDarkTheme())
applyHighContrast(prefersHighContrast())
applyLessArtwork(prefersLessArtwork())
applyFontChoice(storedFontChoice())
// Only an explicit choice here; an unset one is decided by the first Tab press
// in src/App.vue.
applyKeyboardMode(prefersKeyboardMode() === true)

createApp(App).use(router).mount('#app')
