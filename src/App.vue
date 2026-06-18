<template>
  <div :class="{ dark: isDark }" style="min-height: 100vh; background-color: var(--bg); color: var(--text-main); transition: background-color 0.3s ease, color 0.3s ease;">

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
        <nav class="site-nav">
          <RouterLink to="/#writing">Writing</RouterLink>
          <RouterLink to="/#contact">Contact</RouterLink>
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
      <RouterView />

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
      </footer>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

// ─── Dark mode ───
const isDark = ref(false)

function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}

// ─── Current year ───
const year = computed(() => new Date().getFullYear())
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
/* ─── Layout ─── */
.page-wrap {
  max-width: var(--measure);
  margin: 0 auto;
  padding: clamp(5rem, 10vh, 7rem) 1.5rem clamp(2rem, 5vh, 4rem);
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
  width: min(var(--measure), 100%);
  margin-left: auto;
  margin-right: auto;
  padding: clamp(1.2rem, 3vh, 1.8rem) 1.5rem;
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
  font-family: var(--font-sans);
  font-size: 0.875rem;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s ease;
}

.site-nav a:hover {
  color: var(--accent-ink);
}

.site-nav a.router-link-active {
  color: var(--text-main);
}

/* ─── Dark mode toggle ─── */
.theme-toggle {
  background: none;
  border: none;
  cursor: pointer;
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
  cursor: pointer;
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
  cursor: pointer;
  transition: color 0.2s ease, opacity 0.2s ease;
}

.eth-address:hover {
  color: var(--text-main);
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
