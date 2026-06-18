<template>
  <main>

    <!-- Reading progress — goal-gradient feedback toward the finish -->
    <div
      v-if="post"
      class="read-progress"
      :style="{ transform: `scaleX(${readProgress})` }"
      role="progressbar"
      aria-label="Reading progress"
      :aria-valuenow="readPercent"
      aria-valuemin="0"
      aria-valuemax="100"
    />

    <div v-if="loading" class="state-msg">Loading…</div>

    <!-- 404 -->
    <div v-else-if="!post" class="not-found">
      <p class="not-found-code">404</p>
      <p class="not-found-msg">This essay doesn't exist.</p>
      <RouterLink to="/" class="back-link">← Back to writing</RouterLink>
    </div>

    <!-- Article -->
    <article v-else ref="articleRef" class="post">
      <header class="post-header">
        <RouterLink to="/" class="back-link">← Writing</RouterLink>
        <ul v-if="post.tags?.length" class="post-tags">
          <li v-for="tag in post.tags" :key="tag" class="post-tag">{{ tag }}</li>
        </ul>
        <h1 class="post-title">{{ post.title }}</h1>
        <div class="post-meta">
          <span>{{ formatDate(post.createdAt) }}</span>
          <span>{{ formatViews(post.viewCount) }}</span>
        </div>
      </header>

      <figure v-if="post.coverImage" class="post-cover">
        <img :src="post.coverImage" :alt="post.title" loading="lazy" />
      </figure>

      <!-- Render Tiptap JSON as HTML via generateHTML -->
      <div class="post-body prose" :class="{ 'post-body--has-cover': post.coverImage }" v-html="renderedHTML" />

      <!-- Related — peak-end close, keeps the reading loop open (Zeigarnik) -->
      <section v-if="relatedPosts.length" class="related" aria-label="Continue reading">
        <h2 class="related-heading">Continue reading</h2>
        <ul class="related-grid">
          <li v-for="rel in relatedPosts" :key="rel._id" class="related-item">
            <RouterLink :to="{ name: 'post', params: { slug: rel.slug } }" class="related-card">
              <span class="related-date">{{ formatDate(rel.createdAt) }}</span>
              <h3 class="related-title">{{ rel.title }}</h3>
              <p class="related-excerpt">{{ rel.excerpt }}</p>
            </RouterLink>
          </li>
        </ul>
      </section>

      <footer class="post-footer">
        <RouterLink to="/" class="back-link">← Back to writing</RouterLink>
      </footer>
    </article>

  </main>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { generateHTML, type Extensions, type JSONContent } from '@tiptap/core'
import StarterKit   from '@tiptap/starter-kit'
import Image        from '@tiptap/extension-image'
import { Table }    from '@tiptap/extension-table'
import TableRow     from '@tiptap/extension-table-row'
import TableHeader  from '@tiptap/extension-table-header'
import TableCell    from '@tiptap/extension-table-cell'
import Typography   from '@tiptap/extension-typography'
import Underline    from '@tiptap/extension-underline'
import Link         from '@tiptap/extension-link'
import TextAlign    from '@tiptap/extension-text-align'
import { getHCaptchaToken } from '../shared/hcaptcha'
import type { PostDocument, PostMetrics, PostSummary } from '../types/content'

const props = defineProps({
  slug: { type: String, required: true },
})

const post = ref<PostDocument | null>(null)
const relatedPosts = ref<PostSummary[]>([])
const loading = ref(true)
const articleRef = ref<HTMLElement | null>(null)
const completionSent = ref(false)
const completionInFlight = ref(false)
const readProgress = ref(0)
let scrollFrame: number | null = null

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

type MetricError = {
  requiresHCaptcha?: boolean
}

onMounted(() => {
  void loadPost()
})

onBeforeUnmount(() => {
  stopScrollTracking()
})

watch(() => props.slug, () => {
  void loadPost()
})

async function loadPost(): Promise<void> {
  loading.value = true
  post.value = null
  relatedPosts.value = []
  completionSent.value = false
  readProgress.value = 0
  stopScrollTracking()

  try {
    const res = await fetch(`${API_BASE}/post?slug=${encodeURIComponent(props.slug)}`)
    if (res.ok) {
      post.value = await res.json() as PostDocument
    }
  } finally {
    loading.value = false
  }

  if (post.value) {
    await nextTick()
    void reportPostView(post.value.slug)
    startScrollTracking()
    void loadRelated(post.value.slug)
  }
}

async function loadRelated(currentSlug: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/posts`)
    if (!res.ok) return
    const all = await res.json() as PostSummary[]
    relatedPosts.value = all
      .filter(summary => summary.slug !== currentSlug)
      .slice(0, 3)
  } catch {
    relatedPosts.value = []
  }
}

const extensions: Extensions = [
  StarterKit,
  Image.configure({ allowBase64: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Typography,
  Underline,
  Link,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
]

const renderedHTML = computed(() => {
  if (!post.value?.content) return ''
  try {
    return generateHTML(post.value.content as JSONContent, extensions)
  } catch {
    return '<p>Content unavailable.</p>'
  }
})

const readPercent = computed(() => Math.round(readProgress.value * 100))

function formatDate(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatViews(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'view' : 'views'}`
}

function startScrollTracking(): void {
  if (!post.value) return
  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true })
  window.addEventListener('resize', scheduleScrollUpdate)
  scheduleScrollUpdate()
}

function stopScrollTracking(): void {
  window.removeEventListener('scroll', scheduleScrollUpdate)
  window.removeEventListener('resize', scheduleScrollUpdate)
  if (scrollFrame !== null) {
    window.cancelAnimationFrame(scrollFrame)
    scrollFrame = null
  }
}

function scheduleScrollUpdate(): void {
  if (scrollFrame !== null) return
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = null
    updateScroll()
  })
}

// One scroll pass drives both the reading-progress bar (goal-gradient
// feedback) and the 90%-completion metric. Keeps running after the metric
// is sent so the bar still tracks to the end.
function updateScroll(): void {
  if (!post.value || !articleRef.value) return

  const articleTop = articleRef.value.offsetTop
  const articleHeight = articleRef.value.offsetHeight
  const viewportBottom = window.scrollY + window.innerHeight
  const progress = articleHeight <= window.innerHeight
    ? 1
    : (viewportBottom - articleTop) / articleHeight
  const clamped = Math.min(Math.max(progress, 0), 1)

  readProgress.value = clamped

  if (!completionSent.value && !completionInFlight.value && clamped >= 0.9) {
    void reportReadCompletion()
  }
}

async function readMetricError(res: Response): Promise<MetricError> {
  try {
    return await res.json() as MetricError
  } catch {
    return {}
  }
}

async function sendMetricRequest(
  endpoint: 'post-view' | 'post-completion',
  slug: string,
  hcaptchaToken = ''
): Promise<Response> {
  return fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug,
      ...(hcaptchaToken ? { hcaptchaToken } : {}),
    }),
  })
}

async function recordMetric(endpoint: 'post-view' | 'post-completion', slug: string): Promise<PostMetrics | null> {
  const res = await sendMetricRequest(endpoint, slug)
  if (res.ok) {
    return await res.json() as PostMetrics
  }

  const error = await readMetricError(res)
  if (!error.requiresHCaptcha) return null

  const token = await getHCaptchaToken()
  if (!token) return null

  const retry = await sendMetricRequest(endpoint, slug, token)
  if (!retry.ok) return null

  return await retry.json() as PostMetrics
}

async function reportPostView(slug: string): Promise<void> {
  const metrics = await recordMetric('post-view', slug)
  if (metrics && post.value?.slug === slug) {
    Object.assign(post.value, metrics)
  }
}

async function reportReadCompletion(): Promise<void> {
  if (completionSent.value || completionInFlight.value || !post.value) return

  const slug = post.value.slug
  completionInFlight.value = true
  try {
    const metrics = await recordMetric('post-completion', slug)
    if (metrics && post.value?.slug === slug) {
      Object.assign(post.value, metrics)
      completionSent.value = true
    }
  } finally {
    completionInFlight.value = false
  }
}
</script>

<style scoped>
.read-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left center;
  z-index: 200;
  pointer-events: none;
  will-change: transform;
}

.state-msg {
  color: var(--text-muted);
  font-style: italic;
}

.back-link {
  font-size: 0.875rem;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s ease;
  display: inline-block;
  margin-bottom: 2rem;
}
.back-link:hover { color: var(--accent-ink); }

.post-header { margin-bottom: 3rem; }

.post-meta {
  font-size: 0.875rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 1rem 0 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.9rem;
}

.post-tags {
  list-style: none;
  margin: 0 0 1rem 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.post-tag {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-ink);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-radius: 999px;
  padding: 0.22rem 0.66rem;
}

.post-title {
  font-family: var(--font-sans);
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.025em;
  margin: 0;
  color: var(--text-main);
}

.post-cover {
  margin: 0 0 2.5rem 0;
}

.post-cover img {
  width: 100%;
  height: auto;
  display: block;
  border: 1px solid var(--border);
  border-radius: 12px;
}

.post-body {
  border-top: 1px solid var(--border);
  padding-top: 2.5rem;
}

/* When a cover image leads the article, it is the visual break — drop the rule */
.post-body--has-cover {
  border-top: none;
  padding-top: 0;
}

.post-footer {
  margin-top: 4rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}

.not-found { padding: 4rem 0; }

.not-found-code {
  font-family: var(--font-sans);
  font-size: 4rem;
  font-weight: 400;
  color: var(--text-muted);
  margin: 0 0 0.5rem 0;
  letter-spacing: -0.05em;
}

.not-found-msg {
  font-size: 1rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 0 0 2rem 0;
}

/* ─── Related / Continue reading ─── */
.related {
  margin-top: 4rem;
  padding-top: 2rem;
  border-top: 1px solid var(--border);
}

.related-heading {
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 2rem 0;
}

.related-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
}

.related-card {
  display: block;
  height: 100%;
  text-decoration: none;
  color: inherit;
}

.related-date {
  display: block;
  font-size: 0.8rem;
  font-style: italic;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.related-title {
  font-family: var(--font-sans);
  font-size: 1.1rem;
  font-weight: 400;
  line-height: 1.3;
  margin: 0 0 0.5rem 0;
  color: var(--text-main);
}

.related-excerpt {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-muted);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.related-card:hover .related-title {
  color: var(--accent-ink);
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}
</style>

<!-- prose: render Tiptap HTML in Editorial style -->
<style>
.prose { font-family: "Georgia", "Times New Roman", serif; }
.prose p  { font-size: 1rem; line-height: 1.8; margin: 0 0 1.6em; color: var(--text-main); }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-sans); }
.prose h1 { font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 400; letter-spacing: -0.025em; margin: 2em 0 0.6em; }
.prose h2 { font-size: 1.4rem; font-weight: 400; margin: 1.8em 0 0.5em; }
.prose h3 { font-size: 1.1rem; font-weight: 400; margin: 1.5em 0 0.4em; }
.prose blockquote {
  border-left: 1px solid var(--text-main);
  margin: 2rem 0;
  padding-left: 1.4rem;
  color: var(--text-muted);
  font-style: italic;
  font-size: 1.1rem;
}
.prose hr  { border: none; border-top: 1px solid var(--border); margin: 3rem 0; }
.prose ul, .prose ol { padding-left: 1.5rem; margin: 0 0 1.4em; }
.prose li  { margin-bottom: 0.4em; line-height: 1.7; }
.prose .tableWrapper {
  margin: 2rem 0;
  overflow-x: auto;
}
.prose table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.prose th,
.prose td {
  border: 1px solid var(--border);
  padding: 0.75rem 0.8rem;
  text-align: left;
  vertical-align: top;
}
.prose th {
  font-weight: 600;
  background: color-mix(in srgb, var(--bg) 82%, var(--text-main) 3%);
}
.prose img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 2rem auto;
}
.prose a   { color: var(--accent-ink); text-decoration-color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 4px; }
.prose a:hover { text-decoration-thickness: 2px; }
.prose strong { font-weight: 600; }
</style>
