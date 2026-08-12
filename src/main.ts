import { createApp } from 'vue'
import './style.css'
import './styles/cursors.css'
import App from './App.vue'
import router from './router'
import { applyCursorSize, applyNativeCursor, prefersNativeCursor, storedCursorSize } from './shared/cursor'
import {
  applyDarkTheme,
  applyHighContrast,
  applyLessArtwork,
  prefersDarkTheme,
  prefersHighContrast,
  prefersLessArtwork,
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

createApp(App).use(router).mount('#app')
