import { createApp } from 'vue'
import './style.css'
import './styles/cursors.css'
import App from './App.vue'
import router from './router'
import { applyCursorSize, applyNativeCursor, prefersNativeCursor, storedCursorSize } from './shared/cursor'

// Before the first render, so a visitor who opted out or chose a larger cursor
// never sees the default one flash in. Reading these in onMounted would be too late.
applyNativeCursor(prefersNativeCursor())
applyCursorSize(storedCursorSize())

createApp(App).use(router).mount('#app')
