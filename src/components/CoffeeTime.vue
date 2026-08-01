<template>
  <section id="coffee" class="section">
    <div class="writing-head">
      <h2 class="section-heading">
        <span class="cup" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <!-- Steam: three wisps, each drifting on its own delay. -->
            <path class="steam steam--1" d="M8.5 5.2c0-1 1-1.4 1-2.4" />
            <path class="steam steam--2" d="M12 4.6c0-1.2 1-1.6 1-2.8" />
            <path class="steam steam--3" d="M15.5 5.2c0-1 1-1.4 1-2.4" />
            <!-- Cup and handle. -->
            <path d="M4 9h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Z" />
            <path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17" />
            <path d="M3 21h15" />
          </svg>
        </span>
        Coffee Time
      </h2>
      <div class="search">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input v-model="query" type="search" class="search-input" placeholder="Search the log…" aria-label="Search the coffee log" />
      </div>
    </div>

    <!-- The one line on the page that answers to the reader's own clock. -->
    <p class="invite">{{ pourLine }}</p>

    <dl v-if="shelf.cups" class="shelf">
      <div class="shelf-fact">
        <dt>Cups logged</dt>
        <dd>{{ shelf.cups.toLocaleString('en-US') }}</dd>
      </div>
      <div class="shelf-fact">
        <dt>{{ shelf.origins === 1 ? 'Origin' : 'Origins' }}</dt>
        <dd>{{ shelf.origins.toLocaleString('en-US') }}</dd>
      </div>
      <div v-if="shelf.topMethod" class="shelf-fact">
        <dt>Mostly</dt>
        <dd>{{ shelf.topMethod }}</dd>
      </div>
    </dl>

    <!-- Persistent live region: state changes here are announced -->
    <div role="status">
      <LoadingIndicator v-if="loading" label="Loading the coffee log…" />
      <p v-else-if="searching" class="state-msg">Searching…</p>
      <p v-else-if="isSearching && !displayBrews.length" class="state-msg">Nothing matches “{{ trimmedQuery }}”.</p>
      <p v-else-if="!displayBrews.length" class="state-msg">The pot is empty. Nothing brewed yet.</p>
    </div>

    <ol v-if="!loading && !searching && displayBrews.length" class="brew-list">
      <li v-for="brew in displayBrews" :key="brew._id" class="brew-item">

        <div class="brew-head">
          <span class="brew-date">{{ formatDate(brew.createdAt) }}</span>
          <span class="brew-method">{{ brew.method }}</span>
          <span v-if="brew.rating" class="rating" :aria-label="`Rated ${brew.rating} out of 5`">
            <span
              v-for="mark in MAX_RATING"
              :key="mark"
              class="rating-mark"
              :class="{ 'rating-mark--on': mark <= brew.rating }"
              aria-hidden="true"
            ></span>
          </span>
        </div>

        <h3 class="brew-bean">
          {{ brew.bean }}<span v-if="brew.origin" class="brew-origin"> · {{ brew.origin }}</span>
        </h3>

        <p v-if="brew.roaster" class="brew-roaster">Roasted by {{ brew.roaster }}</p>

        <div v-if="hasRecipe(brew)" class="recipe">
          <span v-if="brew.dose" class="recipe-figure">{{ brew.dose }}<abbr title="grams">g</abbr></span>
          <span v-if="brew.water" class="recipe-figure">{{ brew.water }}<abbr title="grams of water">g</abbr></span>
          <span v-if="formatTemperature(brew.temperature)" class="recipe-figure">{{ formatTemperature(brew.temperature) }}</span>
          <span v-if="formatBrewTime(brew.brewSeconds)" class="recipe-figure">{{ formatBrewTime(brew.brewSeconds) }}</span>
        </div>

        <!-- The proportion mark: the accent segment is literally the coffee's
             share of the cup, so an espresso and a cold brew read differently
             at a glance down the list. -->
        <div v-if="formatRatio(brew.dose, brew.water)" class="ratio">
          <span class="ratio-rail">
            <span class="ratio-dose" :style="{ width: `${doseShare(brew.dose, brew.water) * 100}%` }"></span>
          </span>
          <span class="ratio-label">{{ formatRatio(brew.dose, brew.water) }}</span>
        </div>

        <p v-if="brew.tastingNote" class="brew-note">{{ brew.tastingNote }}</p>

        <RouterLink
          v-if="brew.pairedSlug"
          :to="{ name: 'post', params: { slug: brew.pairedSlug } }"
          class="brew-pair"
        >
          <span>Brewed alongside <em>{{ titleFromSlug(brew.pairedSlug) }}</em></span>
          <svg class="brew-pair-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="m256-240-56-56 384-384H240v-80h480v480h-80v-344L256-240Z"/></svg>
        </RouterLink>

      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import LoadingIndicator from './LoadingIndicator.vue'
import {
  doseShare,
  formatBrewTime,
  formatRatio,
  formatTemperature,
  MAX_RATING,
  pourOfTheHour,
} from '../shared/brew'
import type { BrewListResponse, BrewShelf, BrewSummary } from '../types/content'

// Matches the essay and note fields above it, so all three search the same way.
const MIN_QUERY = 2
const DEBOUNCE_MS = 200

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

// Lets the page re-anchor a #hash once this list has its real height.
const emit = defineEmits<{ ready: [] }>()

const brews = ref<BrewSummary[]>([])   // full list, shown when not searching
const results = ref<BrewSummary[]>([]) // server-side search hits
const shelf = ref<BrewShelf>({ cups: 0, origins: 0, topMethod: '' })
const loading = ref(true)              // initial list fetch
const searching = ref(false)           // a query is pending or in flight
const query = ref('')

const trimmedQuery = computed(() => query.value.trim())
const isSearching = computed(() => trimmedQuery.value.length >= MIN_QUERY)
const displayBrews = computed(() => (isSearching.value ? results.value : brews.value))

// Read once on mount rather than per render: a reactive clock would rewrite the
// line mid-visit, and the greeting is for the moment the page was opened.
const pourLine = pourOfTheHour(new Date().getHours())

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let activeController: AbortController | undefined

watch(trimmedQuery, (q) => {
  clearTimeout(debounceTimer)
  activeController?.abort()
  activeController = undefined

  if (q.length < MIN_QUERY) {
    searching.value = false
    results.value = []
    return
  }

  searching.value = true
  debounceTimer = setTimeout(() => void runSearch(q), DEBOUNCE_MS)
})

async function runSearch(q: string): Promise<void> {
  const controller = new AbortController()
  activeController = controller
  try {
    const res = await fetch(`${API_BASE}/brews?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    })
    if (res.ok) {
      const payload = await res.json() as Partial<BrewListResponse>
      results.value = Array.isArray(payload.brews) ? payload.brews : []
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') results.value = []
  } finally {
    // Only the latest request may clear the pending flag; stale ones are ignored.
    if (activeController === controller) {
      searching.value = false
      activeController = undefined
    }
  }
}

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE}/brews`)
    if (res.ok) {
      // Shape-checked rather than trusted: the shelf drives a v-if, so a payload
      // without one would take the whole section down with it.
      const payload = await res.json() as Partial<BrewListResponse>
      if (Array.isArray(payload.brews)) brews.value = payload.brews
      if (payload.shelf) shelf.value = payload.shelf
    }
  } finally {
    loading.value = false
    emit('ready')
  }
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  activeController?.abort()
})

// A brew logged without a scale still belongs in the list; the recipe strip
// simply doesn't render for it.
function hasRecipe(brew: BrewSummary): boolean {
  return Boolean(brew.dose || brew.water || brew.temperature || brew.brewSeconds)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// The paired essay is stored as a slug; a raw slug reads like a URL, so it is
// spoken back as a title. Only the first letter is raised — the essays are
// sentence-case, and title-casing every word would misquote them.
function titleFromSlug(slug: string): string {
  const words = slug.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
</script>

<style scoped>
/* Shares the section chrome with Writing and Notes — heading, search field and
   state messages are deliberately identical, so Coffee Time reads as another
   room in the same house rather than a widget bolted on. */
.section {
  margin-bottom: 1rem;
}

.section-heading {
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.writing-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
}

.state-msg {
  color: var(--text-muted);
  font-style: italic;
}

/* ─── Search ─── */
.search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.35rem;
  transition: border-color 0.2s ease;
}

.search:focus-within {
  border-color: var(--accent);
}

.search-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.search-input {
  font-family: var(--font-sans);
  font-size: 0.8rem;
  letter-spacing: 0.02em;
  color: var(--text-main);
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  width: 12rem;
  max-width: 45vw;
}

.search-input::placeholder {
  color: var(--text-muted);
}

/* ─── The cup, and its steam ─── */
.cup {
  display: inline-flex;
  line-height: 0;
  color: var(--accent);
  /* The glyph is drawn on a 24px grid but sits beside 0.75rem type; nudging it
     down aligns the cup's body with the cap height rather than the baseline. */
  transform: translateY(1px);
}

.steam {
  opacity: 0;
  transform-origin: bottom center;
  animation: steam-rise 4.2s ease-in-out infinite;
}

.steam--2 { animation-delay: 0.5s; }
.steam--3 { animation-delay: 1.1s; }

@keyframes steam-rise {
  0%   { opacity: 0;    transform: translateY(1.5px) scaleY(0.8); }
  30%  { opacity: 0.85; }
  70%  { opacity: 0.5;  }
  100% { opacity: 0;    transform: translateY(-2.5px) scaleY(1.2); }
}

/* The sitewide reduce-motion rule collapses the animation to a single 0.01ms
   run, which would leave every wisp parked at its final frame — invisible.
   Hold them still and visible instead, so the mark is complete without moving. */
@media (prefers-reduced-motion: reduce) {
  .steam {
    animation: none;
    opacity: 0.6;
    transform: none;
  }
}

/* ─── The invitation, and the shelf ─── */
.invite {
  font-size: 0.95rem;
  font-style: italic;
  color: var(--text-muted);
  margin: 0 0 1.5rem 0;
  max-width: 55ch;
}

.shelf {
  display: flex;
  flex-wrap: wrap;
  gap: 0 2.5rem;
  margin: 0 0 2.5rem 0;
  padding: 0.9rem 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.shelf-fact {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.shelf-fact dt {
  font-family: var(--font-sans);
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.shelf-fact dd {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 0.9rem;
  color: var(--text-main);
}

/* ─── Brew list ─── */
.brew-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.brew-item {
  border-bottom: 1px solid var(--border);
  padding: 1.6rem 0;
}

.brew-item:first-child {
  border-top: 1px solid var(--border);
}

.brew-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.8rem;
  margin-bottom: 0.5rem;
}

.brew-date {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
}

.brew-method {
  font-family: var(--font-sans);
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-ink);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
}

/* Rating reads as five small measures rather than stars — quieter, and it
   matches the hairline vocabulary the rest of the page is built from. */
.rating {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
}

.rating-mark {
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 50%;
  border: 1px solid var(--border);
}

.rating-mark--on {
  background: var(--accent);
  border-color: var(--accent);
}

.brew-bean {
  font-family: var(--font-sans);
  font-size: 1.15rem;
  font-weight: 400;
  line-height: 1.3;
  margin: 0 0 0.3rem 0;
  color: var(--text-main);
}

.brew-origin {
  color: var(--text-muted);
}

.brew-roaster {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0 0 0.7rem 0;
}

.recipe {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.9rem;
  margin-bottom: 0.7rem;
}

.recipe-figure {
  font-family: var(--font-sans);
  font-size: 0.8rem;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.recipe-figure abbr {
  color: var(--text-muted);
  text-decoration: none;
  margin-left: 0.1rem;
}

/* Separators between figures rather than a border around each. */
.recipe-figure:not(:first-child) {
  border-left: 1px solid var(--border);
  padding-left: 0.9rem;
}

.ratio {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 0.9rem;
}

.ratio-rail {
  display: block;
  width: 12rem;
  max-width: 55%;
  height: 2px;
  background: var(--border);
}

.ratio-dose {
  display: block;
  height: 100%;
  min-width: 2px;
  background: var(--accent);
}

.ratio-label {
  font-family: var(--font-sans);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.brew-note {
  font-size: 0.95rem;
  line-height: 1.65;
  color: var(--text-main);
  margin: 0;
  max-width: 58ch;
}

/* Same hover grammar as the article rows: the arrow arrives, the text underlines. */
.brew-pair {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.9rem;
  font-size: 0.82rem;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s ease;
}

.brew-pair em {
  font-style: italic;
  color: var(--text-main);
}

.brew-pair:hover {
  color: var(--accent-ink);
}

.brew-pair:hover em {
  color: var(--accent-ink);
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}

.brew-pair-arrow {
  opacity: 0;
  transform: translate(-0.3rem, 0.3rem);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.brew-pair:hover .brew-pair-arrow,
.brew-pair:focus-visible .brew-pair-arrow {
  opacity: 1;
  transform: translate(0, 0);
}
</style>
