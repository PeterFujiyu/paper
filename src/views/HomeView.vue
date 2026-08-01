<template>
  <main id="main" tabindex="-1">

    <!-- ─── Hero ─── -->
    <section class="hero">
      <p class="hero-label">Designer &amp; Creative</p>
      <h1 class="hero-title">
        <span class="hero-highlight">Thinking</span> through<br>
        <span class="hero-highlight">design</span>,<br>
        one page at a time.
      </h1>
      <p class="hero-bio">
        I'm a designer drawn to the quiet tension between form and meaning.
        This space is where I collect observations on visual culture,
        craft, and the overlooked details that shape how we read the world.
      </p>
    </section>

    <hr class="divider" />

    <!-- ─── Writing ─── -->
    <section id="writing" class="section">
      <div class="writing-head">
        <h2 class="section-heading">Writing</h2>
        <div class="search">
          <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input v-model="query" type="search" class="search-input" placeholder="Search essays…" aria-label="Search essays" />
        </div>
      </div>

      <!-- Persistent live region: state changes here are announced -->
      <div role="status">
        <LoadingIndicator v-if="loading" label="Loading essays…" />
        <p v-else-if="!posts.length" class="state-msg">No posts yet.</p>
        <p v-else-if="searching" class="state-msg">Searching…</p>
        <p v-else-if="isSearching && !displayPosts.length" class="state-msg">Nothing matches “{{ trimmedQuery }}”.</p>
      </div>

      <ol v-if="!loading && !searching && displayPosts.length" class="article-list">
        <li v-for="post in displayPosts" :key="post._id" class="article-item">
          <RouterLink :to="{ name: 'post', params: { slug: post.slug } }" class="article-link">
            <div class="article-meta">
              <span>{{ formatDate(post.createdAt) }}</span>
              <span v-if="post.readingMinutes">{{ formatReadingTime(post.readingMinutes) }}</span>
              <span>{{ formatViews(post.viewCount) }}</span>
            </div>
            <h3 class="article-title">{{ post.title }}</h3>
            <p class="article-excerpt">{{ post.excerpt }}</p>
            <ul v-if="post.tags?.length" class="article-tags">
              <li v-for="tag in post.tags" :key="tag" class="article-tag">{{ tag }}</li>
            </ul>
            <span class="article-arrow" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="20" height="20" fill="currentColor"><path d="m256-240-56-56 384-384H240v-80h480v480h-80v-344L256-240Z"/></svg>
            </span>
          </RouterLink>
        </li>
      </ol>
    </section>

    <hr class="divider" />

    <!-- ─── Notes ─── -->
    <section id="notes" class="section">
      <div class="writing-head">
        <h2 class="section-heading">Notes</h2>
        <div class="search">
          <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input v-model="noteQuery" type="search" class="search-input" placeholder="Search notes…" aria-label="Search notes" />
        </div>
      </div>

      <!-- List -->
      <div role="status">
        <LoadingIndicator v-if="notesLoading" label="Loading notes…" />
        <p v-else-if="noteSearching" class="state-msg">Searching…</p>
        <p v-else-if="isSearchingNotes && !displayNotes.length" class="state-msg">Nothing matches “{{ trimmedNoteQuery }}”.</p>
        <p v-else-if="!displayNotes.length" class="state-msg">No notes yet.</p>
      </div>

      <ol v-if="!notesLoading && !noteSearching && displayNotes.length" class="note-list">
        <li v-for="note in displayNotes" :key="note._id" class="note-item">
          <div class="note-meta">{{ formatDate(note.createdAt) }}</div>
          <div class="note-body prose" v-html="renderContentHTML(note.content)"></div>
        </li>
      </ol>
    </section>

    <hr class="divider" />

    <!-- ─── Coffee Time ─── -->
    <CoffeeTime @ready="coffeeReady" />

    <hr class="divider" />

    <!-- ─── Contact ─── -->
    <section id="contact" class="section">
      <h2 class="section-heading">Contact</h2>
      <p class="contact-intro">
        I'm available for conversations about design, collaboration, or simply
        an exchange of ideas. Find me at:
      </p>
      <ul class="contact-list">
        <li>
          <a href="https://github.com/PeterFujiyu" target="_blank" rel="noopener" class="contact-link">
            <span class="contact-label">GitHub</span>
            <span class="contact-handle">github.com/PeterFujiyu</span>
          </a>
        </li>
        <li>
          <a href="https://t.me/peterfujiyu" target="_blank" rel="noopener" class="contact-link">
            <span class="contact-label">Telegram</span>
            <span class="contact-handle">t.me/peterfujiyu</span>
          </a>
        </li>
      </ul>
    </section>

  </main>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { renderContentHTML } from '../shared/tiptap-extensions'
import { formatReadingTime } from '../shared/reading-time'
import { scrollToHash } from '../shared/scroll'
import CoffeeTime from '../components/CoffeeTime.vue'
import LoadingIndicator from '../components/LoadingIndicator.vue'
import type { PostSummary, NoteSummary } from '../types/content'

const MIN_QUERY = 2
const DEBOUNCE_MS = 200

const posts = ref<PostSummary[]>([])   // full list, shown when not searching
const results = ref<PostSummary[]>([]) // server-side full-text search hits
const loading = ref(true)              // initial list fetch
const searching = ref(false)           // a query is pending or in flight
const query = ref('')

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

const route = useRoute()

const trimmedQuery = computed(() => query.value.trim())
const isSearching = computed(() => trimmedQuery.value.length >= MIN_QUERY)
const displayPosts = computed(() => (isSearching.value ? results.value : posts.value))

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
    const res = await fetch(`${API_BASE}/posts?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    })
    if (res.ok) results.value = await res.json() as PostSummary[]
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

// CoffeeTime owns its own fetch, so the page learns that section has settled
// from the child's `ready` event rather than duplicating the request here.
// Assigned synchronously by the Promise executor, before any child can mount.
let resolveCoffee = (): void => {}
const coffeeSettled = new Promise<void>((resolve) => { resolveCoffee = resolve })

function coffeeReady(): void {
  resolveCoffee()
}

onMounted(async () => {
  const notesReady = loadNotes()
  try {
    const res = await fetch(`${API_BASE}/posts`)
    if (res.ok) posts.value = await res.json() as PostSummary[]
  } finally {
    loading.value = false
  }

  // Sections render before their lists do, so a hash arriving with the
  // navigation anchors against a shorter page. Re-anchor once every list exists.
  if (route.hash) {
    await Promise.all([notesReady, coffeeSettled])
    await nextTick()
    scrollToHash(route.hash)
  }
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  activeController?.abort()
  clearTimeout(noteDebounceTimer)
  noteController?.abort()
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatViews(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'view' : 'views'}`
}

// ─── Notes ─── (public read-only list + search; authored in the admin area)
const notes = ref<NoteSummary[]>([])          // full list, shown when not searching
const noteResults = ref<NoteSummary[]>([])    // server-side full-text search hits
const notesLoading = ref(true)                // initial list fetch
const noteSearching = ref(false)              // a query is pending or in flight
const noteQuery = ref('')

const trimmedNoteQuery = computed(() => noteQuery.value.trim())
const isSearchingNotes = computed(() => trimmedNoteQuery.value.length >= MIN_QUERY)
const displayNotes = computed(() => (isSearchingNotes.value ? noteResults.value : notes.value))

let noteDebounceTimer: ReturnType<typeof setTimeout> | undefined
let noteController: AbortController | undefined

watch(trimmedNoteQuery, (q) => {
  clearTimeout(noteDebounceTimer)
  noteController?.abort()
  noteController = undefined

  if (q.length < MIN_QUERY) {
    noteSearching.value = false
    noteResults.value = []
    return
  }

  noteSearching.value = true
  noteDebounceTimer = setTimeout(() => void runNoteSearch(q), DEBOUNCE_MS)
})

async function runNoteSearch(q: string): Promise<void> {
  const controller = new AbortController()
  noteController = controller
  try {
    const res = await fetch(`${API_BASE}/notes?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    })
    if (res.ok) noteResults.value = await res.json() as NoteSummary[]
  } catch (err) {
    if ((err as Error).name !== 'AbortError') noteResults.value = []
  } finally {
    // Only the latest request may clear the pending flag; stale ones are ignored.
    if (noteController === controller) {
      noteSearching.value = false
      noteController = undefined
    }
  }
}

async function loadNotes(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/notes`)
    if (res.ok) notes.value = await res.json() as NoteSummary[]
  } finally {
    notesLoading.value = false
  }
}
</script>

<style scoped>
/* ─── Hero ─── */
.hero {
  margin-bottom: 4rem;
}

.hero-label {
  font-family: var(--font-sans);
  font-size: 0.875rem;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 1.2rem;
}

.hero-title {
  font-family: var(--font-sans);
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: -0.03em;
  margin: 0 0 1.5rem 0;
  color: var(--text-main);
  /* Shrink the block to its longest line so a multi-line selection
     hugs the text instead of filling the empty 68ch reading column. */
  width: fit-content;
}

.hero-highlight {
  position: relative;
  display: inline-block;
  padding-bottom: 0.05em;
}

.hero-highlight::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent);
}

.hero-bio {
  font-size: 1rem;
  line-height: 1.75;
  color: var(--text-muted);
  max-width: 65ch;
  margin: 0;
}

/* ─── Divider ─── */
.divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 3.5rem 0;
}

/* ─── Section heading ─── */
.state-msg {
  color: var(--text-muted);
  font-style: italic;
}

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
  margin: 0 0 2.5rem 0;
}

/* ─── Search (in-place filter) ─── */
.writing-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  flex-wrap: wrap;
  margin-bottom: 2.5rem;
}

.writing-head .section-heading {
  margin: 0;
}

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

/* ─── Article list ─── */
.article-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.article-item {
  border-bottom: 1px solid var(--border);
}

.article-item:first-child {
  border-top: 1px solid var(--border);
}

.article-link {
  display: block;
  position: relative;
  padding: 1.6rem 0;
  text-decoration: none;
  color: inherit;
}

.article-link:hover .article-title {
  color: var(--accent-ink);
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}

.article-arrow {
  position: absolute;
  top: 1.6rem;
  right: 0.25rem;
  display: inline-flex;
  line-height: 0;
  color: var(--accent-ink);
  opacity: 0;
  transform: translate(-0.4rem, 0.4rem);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

.article-link:hover .article-arrow,
.article-link:focus-visible .article-arrow {
  opacity: 1;
  transform: translate(0, 0);
}

.article-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.4rem;
  font-style: italic;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.8rem;
}

.article-title {
  font-family: var(--font-sans);
  font-size: 1.15rem;
  font-weight: 400;
  line-height: 1.3;
  margin: 0 0 0.6rem 0;
  color: var(--text-main);
}

.article-excerpt {
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.65;
  margin: 0;
}

.article-tags {
  list-style: none;
  margin: 0.7rem 0 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.article-tag {
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

/* ─── Notes ─── */
.note-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.note-item {
  border-bottom: 1px solid var(--border);
  padding: 1.6rem 0;
}

.note-item:first-child {
  border-top: 1px solid var(--border);
}

.note-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.6rem;
  font-style: italic;
}

/* Trim the leading/trailing margins the global .prose rules add so notes sit
   snugly inside their list rows. :deep() is required to reach the v-html content,
   which doesn't carry this component's scope attribute. */
.note-body :deep(:first-child) {
  margin-top: 0;
}

.note-body :deep(:last-child) {
  margin-bottom: 0;
}

/* ─── Contact ─── */
.contact-intro {
  font-size: 1rem;
  color: var(--text-muted);
  line-height: 1.7;
  margin: 0 0 2rem 0;
}

.contact-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.contact-list li {
  border-bottom: 1px solid var(--border);
}

.contact-list li:first-child {
  border-top: 1px solid var(--border);
}

.contact-link {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 1.1rem 0;
  text-decoration: none;
  color: inherit;
}

.contact-label {
  font-family: var(--font-sans);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.contact-handle {
  font-size: 0.95rem;
  color: var(--text-main);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
  transition: text-decoration-thickness 0.2s ease;
}

.contact-link:hover .contact-handle {
  color: var(--accent-ink);
  text-decoration-color: var(--accent);
  text-decoration-thickness: 2px;
}
</style>
