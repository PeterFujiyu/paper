<template>
  <div :class="{ dark: isDark, 'high-contrast': highContrast, 'less-artwork': lessArtwork, 'shell-wide': route.meta.wide }" style="min-height: 100vh; background-color: var(--bg); color: var(--text-main); transition: background-color 0.3s ease, color 0.3s ease;">

    <!-- Keyboard skip target — the only element hidden until :focus-visible -->
    <a class="skip-link" href="#main" @click.prevent="skipToMain">Skip to content</a>

    <!-- ─── Header (fixed) ─── -->
    <header class="site-header">
      <RouterLink to="/" class="wordmark" aria-label="PeterFujiyu">
        <span
          v-for="(char, i) in wordmarkChars"
          :key="i"
          class="wm-char"
          :class="{ 'wm-char--hidden': isScrolling && i > 0 }"
          :style="charStyle(i)"
        >{{ char }}</span>
      </RouterLink>
      <div class="header-right">
        <nav class="site-nav" aria-label="Primary">
          <RouterLink to="/#writing">
            <span>Writing</span>
            <svg class="nav-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>
          </RouterLink>
          <RouterLink to="/#notes">
            <span>Notes</span>
            <svg class="nav-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>
          </RouterLink>
          <RouterLink to="/#coffee">
            <span>Coffee</span>
            <svg class="nav-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>
          </RouterLink>
          <RouterLink to="/#contact">
            <span>Contact</span>
            <svg class="nav-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>
          </RouterLink>
        </nav>
        <button class="theme-toggle" @click="toggleDark" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'">
          <!-- sun: shown in dark mode (click → light) -->
          <svg v-if="isDark" class="toggle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
          <!-- moon + star: shown in light mode (click → dark) -->
          <svg v-else class="toggle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 5h4" />
            <path d="M20 3v4" />
            <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
          </svg>
        </button>
      </div>
    </header>

    <!-- ─── Page content ─── -->
    <div class="page-wrap">
      <!-- Height is reserved only mid-swap: `out-in` empties the flow between
           views, which would otherwise pull the footer up into the viewport. -->
      <div :class="{ 'route-view--swapping': swapping }">
        <RouterView v-slot="{ Component }">
          <Transition
            name="page"
            mode="out-in"
            appear
            @before-leave="swapping = true"
            @after-enter="swapping = false"
            @leave-cancelled="swapping = false"
            @enter-cancelled="swapping = false"
          >
            <component :is="Component" />
          </Transition>
        </RouterView>
      </div>

      <!-- ─── Footer ─── -->
      <footer class="site-footer">
        <span>© {{ year }} Peter Fujiyu</span>
        <span class="footer-sep">·</span>
        <span style="color: var(--text-muted); font-style: italic;">All opinions are my own.</span>
        <span class="footer-sep">·</span>
        <button
          class="eth-toggle"
          type="button"
          @click="showEth = !showEth"
          :aria-expanded="showEth"
          aria-label="Show Ethereum address"
        >
          <svg viewBox="0 0 256 417" aria-hidden="true" class="eth-icon">
            <path fill="currentColor" d="M127.9 0L124.7 10.9V279.1L127.9 282.3L255.8 210.7z" />
            <path fill="currentColor" opacity="0.72" d="M127.9 0L0 210.7L127.9 282.3V152.2z" />
            <path fill="currentColor" opacity="0.88" d="M127.9 306.5L126.1 308.7V416.2L127.9 421.4L255.9 234.9z" />
            <path fill="currentColor" opacity="0.6" d="M127.9 421.4V306.5L0 234.9z" />
            <path fill="currentColor" opacity="0.76" d="M127.9 282.3L255.8 210.7L127.9 152.2z" />
            <path fill="currentColor" opacity="0.52" d="M0 210.7L127.9 282.3V152.2z" />
          </svg>
        </button>
        <transition name="eth-fade">
          <button
            v-if="showEth"
            class="eth-address"
            type="button"
            @click="copyEthAddress"
            :aria-label="copiedEth ? 'Ethereum address copied' : 'Copy Ethereum address'"
          >
            {{ copiedEth ? 'Copied' : ethAddress }}
          </button>
        </transition>
        <!-- Persistent live region — the fading button above can't announce reliably -->
        <span class="sr-only" role="status">{{ copiedEth ? 'Ethereum address copied' : '' }}</span>

        <span class="footer-sep">·</span>
        <button
          class="settings-toggle"
          type="button"
          @click="showSettings = !showSettings"
          :aria-expanded="showSettings"
          aria-controls="footer-settings"
          aria-label="Site settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="settings-icon">
            <path d="M20 7h-9" />
            <path d="M14 17H5" />
            <circle cx="17" cy="17" r="3" />
            <circle cx="7" cy="7" r="3" />
          </svg>
        </button>
        <transition name="eth-fade">
          <span v-if="showSettings" id="footer-settings" class="settings-panel">
            <label class="settings-row">
              <input id="setting-themed-cursor" type="checkbox" :checked="themedCursor" @change="toggleCursor" />
              <span>Use this site's cursor</span>
            </label>
            <span class="settings-row">
              <span id="cursor-size-label">Size</span>
              <!-- Real radios rather than a <select>: a native dropdown renders in
                   OS chrome, which ignores the site's type and its cursors. Hiding
                   the inputs instead keeps arrow-key navigation and the checked
                   state that assistive tech announces. -->
              <span class="size-choice" role="radiogroup" aria-labelledby="cursor-size-label">
                <template v-for="option in CURSOR_SIZE_OPTIONS" :key="option.value">
                  <input
                    :id="`cursor-size-${option.value}`"
                    class="sr-only"
                    type="radio"
                    name="cursor-size"
                    :value="option.value"
                    :checked="cursorSize === option.value"
                    :disabled="!themedCursor"
                    @change="changeCursorSize(option.value)"
                  />
                  <label :for="`cursor-size-${option.value}`" class="size-option">{{ option.label }}</label>
                </template>
              </span>
            </span>
            <!-- Contrast sits beside the cursor rather than in the header next to
                 the dark-mode toggle: both are accommodations a visitor sets once,
                 while light/dark is a mood switch pressed often. -->
            <label class="settings-row">
              <input id="setting-high-contrast" type="checkbox" :checked="highContrast" @change="toggleContrast" />
              <span>Higher contrast</span>
            </label>
            <!-- Drops the decorative drawings — empty-state illustrations, section
                 marks, the loading figure — and keeps every icon that is an
                 affordance rather than ornament. -->
            <label class="settings-row">
              <input id="setting-less-artwork" type="checkbox" :checked="lessArtwork" @change="toggleArtwork" />
              <span>Less artwork</span>
            </label>
            <!-- Bibata is GPL-3.0, so the credit travels with the art. The panel is
                 collapsed by default, so this costs the footer nothing at rest. -->
            <span class="settings-credit">Cursor: Bibata Modern Ice · GPL-3.0</span>
          </span>
        </transition>
      </footer>
    </div>

    <!-- App-wide web-native dialog host (replaces window.confirm / window.alert) -->
    <AppDialog />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import AppDialog from './shared/AppDialog.vue'
import type { CursorSize } from './shared/cursor'
import {
  CURSOR_SIZE_OPTIONS,
  prefersNativeCursor,
  setCursorSize,
  setNativeCursor,
  storedCursorSize,
} from './shared/cursor'
import {
  prefersDarkTheme,
  prefersHighContrast,
  prefersLessArtwork,
  setDarkTheme,
  setHighContrast,
  setLessArtwork,
} from './shared/theme'

// ─── Route transition ───
// True from the moment the outgoing view starts leaving until the incoming one
// has settled; drives the placeholder height that keeps the footer in place.
const swapping = ref(false)

// Reading views are held to --measure. A view that is reference rather than
// prose opts out with `meta.wide` (see src/router/index.ts).
const route = useRoute()

// ─── Dark mode ───
// src/main.ts has already applied the stored preference to <html> before mount,
// so this only mirrors it into the toggle. Resolving it here rather than in
// onMounted is what keeps the first frame from painting light and then flipping.
const isDark = ref(prefersDarkTheme())

function toggleDark() {
  isDark.value = !isDark.value
  setDarkTheme(isDark.value)
}

// ─── Footer settings ───
// src/main.ts has already applied the stored preference to <html>, so this only
// mirrors it into the checkbox. Opting out hands every cursor back to the OS,
// which matters for anyone relying on an enlarged system pointer — there is no
// media query that would let CSS detect that on its own.
const showSettings = ref(false)
const themedCursor = ref(!prefersNativeCursor())
const cursorSize = ref<CursorSize>(storedCursorSize())

function toggleCursor(): void {
  themedCursor.value = !themedCursor.value
  setNativeCursor(!themedCursor.value)
}

// The size only means anything while the theme is on, so the choices are disabled
// alongside it rather than silently doing nothing.
function changeCursorSize(size: CursorSize): void {
  cursorSize.value = size
  setCursorSize(size)
}

// Also already applied to <html> by src/main.ts, and mirrored here for the same
// reason as dark mode: resolving it during setup keeps the default palette from
// painting for a frame before the stronger one replaces it.
const highContrast = ref(prefersHighContrast())

function toggleContrast(): void {
  highContrast.value = !highContrast.value
  setHighContrast(highContrast.value)
}

const lessArtwork = ref(prefersLessArtwork())

function toggleArtwork(): void {
  lessArtwork.value = !lessArtwork.value
  setLessArtwork(lessArtwork.value)
}

// ─── Current year ───
const year = computed(() => new Date().getFullYear())

// Skip link: focus the current view's <main> directly. A raw #main hash click
// behaves oddly with createWebHistory + the router's scrollBehavior, so we
// keep the href for semantics/no-JS but drive focus imperatively.
function skipToMain(): void {
  document.getElementById('main')?.focus()
}

const showEth = ref(false)
const copiedEth = ref(false)
const ethAddress = '0x590aef1cb9d2c66f2543cbeaa64f603e07fd1679'
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function copyEthAddress() {
  try {
    await navigator.clipboard.writeText(ethAddress)
    copiedEth.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedEth.value = false
    }, 1400)
  } catch {
    copiedEth.value = false
  }
}

// ─── Wordmark scroll animation ───
const WORDMARK = 'PeterFujiyu'
const wordmarkChars = WORDMARK.split('')

const isScrolling = ref(false)
let scrollTimer: ReturnType<typeof setTimeout> | null = null

function charStyle(i: number): Record<string, string> {
  if (i === 0) return {}
  const collapseDelay = (wordmarkChars.length - 1 - i) * 28
  const expandDelay   = (i - 1) * 38
  const delay = isScrolling.value ? collapseDelay : expandDelay
  return { transitionDelay: `${delay}ms` }
}

function onScroll() {
  isScrolling.value = true
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    isScrolling.value = false
  }, 320)
}

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  if (scrollTimer) clearTimeout(scrollTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<style scoped>
/* ─── Skip link ─── (hidden until keyboard focus; tokens only) */
.skip-link {
  position: fixed;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 110;
  padding: 0.6rem 1rem;
  background-color: var(--bg);
  color: var(--text-main);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  text-decoration: none;
  transform: translateY(calc(-100% - 1rem));
  transition: transform 0.2s ease;
}

.skip-link:focus-visible {
  transform: translateY(0);
}

/* ─── Layout ─── */
/* ─── Shell width ───
   The header and the content column are centred independently, so they only
   line up while they agree on a width. Both read --shell-w rather than naming
   --measure themselves; a route that needs more room overrides the one
   variable and the header follows it. */
.page-wrap {
  max-width: var(--shell-w, var(--measure));
  margin: 0 auto;
  padding: clamp(5rem, 10vh, 7rem) 1.5rem clamp(2rem, 5vh, 4rem);
}

/* Room for a sidebar alongside a measure of text — 15rem of rail plus a 3.5rem
   gap. Set by `meta.wide` in src/router/index.ts. The reading column inside is
   still capped at --measure, so prose is never set wider than it should be. */
.shell-wide {
  --shell-w: calc(var(--measure) + 18.5rem);
}

.route-view--swapping {
  min-height: 100vh;
}

/* ─── Header ─── */
.site-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background-color: var(--bg);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: min(var(--shell-w, var(--measure)), 100%);
  margin-left: auto;
  margin-right: auto;
  padding: var(--header-pad-y) 1.5rem;
  transition:
    background-color 0.3s ease,
    border-color     0.3s ease;
}

/* ─── Wordmark ─── */
.wordmark {
  font-family: var(--font-sans);
  font-size: 1.05rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-decoration: none;
  color: var(--text-main);
  display: inline-flex;
  align-items: baseline;
  overflow: hidden;
  line-height: 1.4;
}

.wm-char {
  display: inline-block;
  max-width: 1.2ch;
  opacity: 1;
  transform: translateY(0px);
  transition:
    max-width  0.38s cubic-bezier(0.4, 0, 0.2, 1),
    opacity    0.28s cubic-bezier(0.4, 0, 0.2, 1),
    transform  0.32s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: pre;
  overflow: hidden;
  vertical-align: baseline;
}

.wm-char--hidden {
  max-width: 0;
  opacity: 0;
  transform: translateY(-3px);
}

/* ─── Nav ─── */
.header-right {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.site-nav {
  display: flex;
  gap: 1.5rem;
}

.site-nav a {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s ease;
}

.site-nav a:hover {
  color: var(--accent-ink);
}

.nav-chevron {
  transition: transform 0.2s ease;
}

.site-nav a:hover .nav-chevron,
.site-nav a:focus-visible .nav-chevron {
  transform: rotate(180deg);
}

.site-nav a.router-link-active {
  color: var(--text-main);
}

/* The nav carries four destinations, which is more than a phone's width holds at
   the desktop rhythm — without this the flex row crushes the wordmark instead.
   Tighten the gaps first, rather than dropping a section from the nav. */
@media (max-width: 40rem) {
  .header-right {
    gap: 1rem;
  }

  .site-nav {
    gap: 0.9rem;
  }
}

@media (max-width: 30rem) {
  .site-nav {
    gap: 0.55rem;
  }

  .site-nav a {
    font-size: 0.8rem;
  }

  /* The chevrons annotate a hover state a touch device never enters. */
  .nav-chevron {
    display: none;
  }

  /* Even tightened, four destinations plus the full wordmark do not fit a phone.
     The wordmark yields — but to its own collapsed form rather than to clipping:
     this is the same reduction it already performs while scrolling, so the mark
     stays deliberate and still links home. */
  .wordmark {
    flex-shrink: 0;
  }

  .wm-char:not(:first-child) {
    max-width: 0;
    opacity: 0;
  }
}

/* ─── Dark mode toggle ─── */
.theme-toggle {
  background: none;
  border: none;
  cursor: var(--cursor-pointer);
  padding: 0;
  line-height: 1;
  color: var(--text-muted);
  transition: color 0.2s ease;
}

.theme-toggle:hover {
  color: var(--text-main);
}

.toggle-icon {
  display: block;
  width: 1.15rem;
  height: 1.15rem;
}

/* ─── Footer ─── */
.site-footer {
  margin-top: 4rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  font-size: 0.825rem;
  color: var(--text-muted);
  display: flex;
  gap: 0.6rem;
  align-items: center;
  /* The settings panel claims a full row of its own via flex-basis, and wrapping
     also keeps the row from overflowing once the ETH address is revealed. */
  flex-wrap: wrap;
  row-gap: 0.5rem;
}

.footer-sep {
  opacity: 0.4;
}

.eth-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  opacity: 0.62;
  cursor: var(--cursor-pointer);
  transition: opacity 0.2s ease, color 0.2s ease;
}

.eth-toggle:hover {
  opacity: 1;
  color: var(--text-main);
}

.eth-icon {
  width: 0.78rem;
  height: 0.78rem;
}

.eth-address {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.78rem;
  letter-spacing: 0.01em;
  color: var(--text-muted);
  word-break: break-all;
  cursor: var(--cursor-pointer);
  transition: color 0.2s ease, opacity 0.2s ease;
}

.eth-address:hover {
  color: var(--text-main);
}

/* Settings disclosure — same icon-button and reveal idiom as .eth-toggle above,
   so the footer keeps one behaviour rather than two. */
.settings-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  opacity: 0.62;
  cursor: var(--cursor-pointer);
  transition: opacity 0.2s ease, color 0.2s ease;
}

.settings-toggle:hover {
  opacity: 1;
  color: var(--text-main);
}

.settings-icon {
  width: 0.85rem;
  height: 0.85rem;
}

.settings-panel {
  /* Its own row inside the wrapping footer flex line. */
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-top: 0.15rem;
}

.settings-row {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  cursor: var(--cursor-pointer);
}

.settings-row input {
  /* A native checkbox keeps the keyboard and screen-reader behaviour for free;
     accent-color is enough to bring it into the palette. */
  accent-color: var(--accent);
  width: 0.8rem;
  height: 0.8rem;
  margin: 0;
  cursor: var(--cursor-pointer);
}

/* Segmented choice card. The inputs are .sr-only, so every visual state below
   hangs off the real radio's :checked / :disabled / :focus-visible. */
.size-choice {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 2px;
}

.size-option {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  padding: 0.12rem 0.45rem;
  color: var(--text-muted);
  cursor: var(--cursor-pointer);
  transition: color 0.2s ease, background-color 0.2s ease;
  /* "Extra large" otherwise breaks across two lines and doubles the card height. */
  white-space: nowrap;
}

/* Dividers between segments, rather than a border on every one. */
.size-option:not(:first-of-type) {
  border-left: 1px solid var(--border);
}

.size-option:hover {
  color: var(--text-main);
}

/* Selected: the reserved accent plus a filled ground, so selection reads without
   relying on hue alone. */
.size-choice input:checked + .size-option {
  color: var(--accent-ink);
  background: var(--bg-subtle);
  box-shadow: inset 0 -1.5px 0 var(--accent);
}

/* The input is visually hidden, so the focus ring has to live on the label. */
.size-choice input:focus-visible + .size-option {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.size-choice input:disabled + .size-option {
  opacity: 0.4;
  cursor: var(--cursor-not-allowed);
}

.settings-credit {
  font-size: 0.72rem;
  opacity: 0.55;
  font-style: italic;
}

/* High contrast: the footer builds its hierarchy out of opacity, which no colour
   token can reach. Each dim is lifted just far enough to be legible while keeping
   the ordering — separators still recede, a disabled segment still reads disabled. */
:root.high-contrast .footer-sep {
  opacity: 0.75;
}

:root.high-contrast .eth-toggle,
:root.high-contrast .settings-toggle {
  opacity: 1;
}

:root.high-contrast .settings-credit {
  opacity: 0.9;
}

:root.high-contrast .size-choice input:disabled + .size-option {
  opacity: 0.65;
}

.eth-fade-enter-active,
.eth-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.eth-fade-enter-from,
.eth-fade-leave-to {
  opacity: 0;
  transform: translateY(2px);
}
</style>
