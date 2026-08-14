<template>
  <div class="edit-wrap">

    <!-- Meta bar -->
    <header class="edit-header">
      <RouterLink to="/admin" class="back-link">← Posts</RouterLink>
      <div class="edit-actions">
        <PublicationToggle v-model="form.published" />
        <button class="btn-save" :class="{ 'btn-save--saving': saving }" @click="save" :disabled="saving || !!validationMessage">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button v-if="isEdit" class="btn-delete" @click="remove">Delete</button>
      </div>
    </header>

    <p v-if="error || validationMessage" class="edit-error" role="alert">{{ error || validationMessage }}</p>

    <section v-if="isEdit" class="metrics-strip" aria-label="Post metrics">
      <div>
        <span class="metric-label">Views</span>
        <strong>{{ metrics.viewCount.toLocaleString('en-US') }}</strong>
      </div>
      <div>
        <span class="metric-label">Read completion</span>
        <strong>{{ metrics.readCompletionRate }}%</strong>
      </div>
      <div>
        <span class="metric-label">Completed reads</span>
        <strong>{{ metrics.readCompletionCount.toLocaleString('en-US') }}</strong>
      </div>
    </section>

    <!-- Title + meta fields -->
    <div class="meta-fields">
      <!-- A visible label here would alter the editorial title treatment; the
           aria-label carries the name for assistive tech instead. -->
      <input
        v-model="form.title"
        class="field-title"
        placeholder="Post title"
        aria-label="Post title"
        @blur="autoSlug"
      />
      <div class="field-row">
        <div class="field-group">
          <label for="post-slug">Slug</label>
          <input id="post-slug" v-model="form.slug" class="field-input" placeholder="url-slug" aria-describedby="post-slug-help" @blur="checkSlugAvailability" />
          <!-- Persistent status region: empty until a message lands, so its
               availability updates are announced. Collapsed via :empty, never hidden. -->
          <p id="post-slug-help" class="field-help" :class="slugAvailable ? 'field-help--ok' : 'field-help--error'" role="status">
            {{ slugMessage }}
          </p>
        </div>
      </div>
      <div class="field-group">
        <label for="post-excerpt">Excerpt</label>
        <textarea id="post-excerpt" v-model="form.excerpt" class="field-textarea" rows="2" placeholder="One or two sentences for the listing page." />
      </div>
      <div class="field-group">
        <label for="post-cover">Cover image URL</label>
        <input id="post-cover" v-model="form.coverImage" class="field-input" placeholder="https://… or /path.jpg" />
        <img v-if="form.coverImage" :src="form.coverImage" class="cover-preview" alt="Cover preview" />
      </div>
      <div class="field-group">
        <label for="post-tags">Tags</label>
        <input id="post-tags" v-model="tagsInput" class="field-input" placeholder="design, typography (comma separated, up to 6)" />
      </div>
      <div class="field-group">
        <label for="post-reading">Reading time</label>
        <input
          id="post-reading"
          v-model="readingInput"
          class="field-input field-input--narrow"
          type="number"
          min="1"
          :max="MAX_READING_MINUTES"
          step="1"
          inputmode="numeric"
          placeholder="Auto"
          aria-describedby="post-reading-help"
        />
        <p id="post-reading-help" class="field-help" :class="readingError ? 'field-help--error' : 'field-help--muted'">
          {{ readingError || readingHelp }}
        </p>
      </div>
    </div>

    <!-- Body editor -->
    <TiptapEditor v-model="form.content" />

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import TiptapEditor from '../components/TiptapEditor.vue'
import PublicationToggle from '../components/PublicationToggle.vue'
import { apiFetch } from '../store'
import { confirmDialog } from '../../shared/dialog'
import {
  isValidSlug,
  normalizeSlug,
  slugify,
  SLUG_VALIDATION_MESSAGE,
} from '../../shared/slug'
import { formatReadingTime, MAX_READING_MINUTES } from '../../shared/reading-time'
import type { PostDocument, PostForm, PostMetrics } from '../../types/content'

const route  = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id && route.params.id !== 'new')
const postId = computed(() => String(route.params.id ?? ''))

// Everything but the reading override, which lives in `readingInput` so the
// field can hold what the author typed even when it isn't a usable number.
const form = reactive<Omit<PostForm, 'readingMinutesOverride'>>({
  title:      '',
  slug:       '',
  excerpt:    '',
  content:    null,
  published:  false,
  coverImage: '',
  tags:       [],
})

const tagsInput = computed({
  get: () => form.tags.join(', '),
  set: (value: string) => {
    form.tags = value
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
  },
})

// The field as typed. Only a blank field means "let the server estimate from the
// body" — 0, 4.5 and 1000 are mistakes to report, not values to quietly rewrite
// into a figure the author never asked for. v-model on a number input hands back
// a number when the text parses and the raw string when it does not, so both
// arrive here.
const readingInput = ref<string | number>('')

// The override as it would be sent: null for a blank field, otherwise whatever
// the text parses to — `readingError` is what keeps a bad one from being saved.
const readingOverride = computed<number | null>(() => {
  const raw = typeof readingInput.value === 'number' ? readingInput.value : readingInput.value.trim()
  return raw === '' ? null : Number(raw)
})

// Mirrors the bounds validatePostBody enforces, so the author sees the problem
// at the field instead of getting a 400 back.
const readingError = computed(() => {
  const minutes = readingOverride.value
  if (minutes == null) return ''
  if (!Number.isFinite(minutes)) return 'Reading time must be a number.'
  if (!Number.isInteger(minutes)) return 'Reading time must be a whole number of minutes.'
  if (minutes < 1) return 'Reading time must be at least 1 minute.'
  if (minutes > MAX_READING_MINUTES) return `Reading time must be ${MAX_READING_MINUTES} minutes or fewer.`
  return ''
})

// The estimate as last stored, so the author can see what "Auto" resolved to.
const savedReadingMinutes = ref(0)

const readingHelp = computed(() => {
  if (readingOverride.value != null) return 'Overrides the estimate from the body.'
  if (savedReadingMinutes.value > 0) {
    return `Estimated from the body — ${formatReadingTime(savedReadingMinutes.value)}. Re-estimated on save.`
  }
  return 'Leave blank to estimate from the body.'
})

const metrics = reactive<PostMetrics>({
  viewCount: 0,
  readCompletionCount: 0,
  readCompletionRate: 0,
})

const saving = ref(false)
const error  = ref('')
const slugAvailable = ref(true)
const slugMessage = ref('')

const validationMessage = computed(() => {
  const slug = normalizeSlug(form.slug)

  if (!form.title.trim()) return 'Title is required.'
  if (form.title.trim().length < 3) return 'Title must be at least 3 characters.'
  if (!slug) return 'Slug is required.'
  if (!isValidSlug(slug)) return SLUG_VALIDATION_MESSAGE
  if (!slugAvailable.value) return 'Slug is already in use.'
  if (!form.excerpt.trim()) return 'Excerpt is required.'
  if (form.excerpt.trim().length < 12) return 'Excerpt should be at least 12 characters.'
  if (!form.content) return 'Body content is required.'
  if (readingError.value) return readingError.value
  return ''
})

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed'
}

function setSlugState(available: boolean, message = ''): void {
  slugAvailable.value = available
  slugMessage.value = message
}

function setMetrics(post: Partial<PostMetrics>): void {
  Object.assign(metrics, {
    viewCount: post.viewCount ?? 0,
    readCompletionCount: post.readCompletionCount ?? 0,
    readCompletionRate: post.readCompletionRate ?? 0,
  })
}

async function checkSlugAvailability(): Promise<void> {
  const slug = normalizeSlug(form.slug)

  if (slug !== form.slug) {
    form.slug = slug
  }

  if (!slug) {
    setSlugState(true, '')
    return
  }

  if (!isValidSlug(slug)) {
    setSlugState(false, SLUG_VALIDATION_MESSAGE)
    return
  }

  try {
    const query = new URLSearchParams({ slug })
    if (isEdit.value) query.set('excludeId', postId.value)

    const result = await apiFetch<{ available: boolean }>(`/slug-check?${query.toString()}`)
    setSlugState(result.available, result.available ? 'Slug is available.' : 'Slug is already in use.')
  } catch (err: unknown) {
    setSlugState(false, getErrorMessage(err))
  }
}

onMounted(async () => {
  if (!isEdit.value) return
  const post = await apiFetch<PostDocument>(`/admin-post?id=${encodeURIComponent(postId.value)}`)
  Object.assign(form, {
    title:      post.title,
    slug:       post.slug,
    excerpt:    post.excerpt ?? '',
    content:    post.content ?? null,
    published:  post.published,
    coverImage: post.coverImage ?? '',
    tags:       post.tags ?? [],
  })
  // Only a real override prefills the field; an estimate must stay "Auto" or the
  // next save would freeze it as the body goes on changing.
  readingInput.value = post.readingMinutesOverride || ''
  savedReadingMinutes.value = post.readingMinutes ?? 0
  setMetrics(post)
  setSlugState(true, '')
})

watch(() => form.slug, () => {
  setSlugState(true, '')
})

function autoSlug() {
  if (!form.slug && form.title) {
    form.slug = slugify(form.title)
  }
  void checkSlugAvailability()
}

async function save() {
  if (saving.value) return

  await checkSlugAvailability()

  if (validationMessage.value) {
    error.value = validationMessage.value
    return
  }

  saving.value = true
  error.value  = ''
  try {
    const payload: PostForm = { ...form, readingMinutesOverride: readingOverride.value }

    if (isEdit.value) {
      const post = await apiFetch<PostDocument>(`/post?id=${encodeURIComponent(postId.value)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setMetrics(post)
      savedReadingMinutes.value = post.readingMinutes ?? 0
    } else {
      const post = await apiFetch<PostDocument>('/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      // The router reuses this component for the /posts/:id route, so onMounted
      // won't run again — take the estimate from the response or the help text
      // would claim there is none until a reload.
      savedReadingMinutes.value = post.readingMinutes ?? 0
      router.replace(`/admin/posts/${post._id}`)
    }
  } catch (e: unknown) {
    error.value = getErrorMessage(e)
  } finally {
    saving.value = false
  }
}

async function remove() {
  const confirmed = await confirmDialog({
    title: 'Delete post',
    message: 'Delete this post? This cannot be undone.',
    confirmText: 'Delete',
    tone: 'danger',
  })
  if (!confirmed) return
  await apiFetch<{ ok: boolean }>(`/post?id=${encodeURIComponent(postId.value)}`, { method: 'DELETE' })
  router.push('/admin')
}
</script>

<style scoped>
.edit-wrap {
  max-width: 56rem;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 1.2rem;
}

.back-link {
  font-size: 0.875rem;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s;
}
.back-link:hover { color: var(--text-main); }

.edit-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn-save {
  font-family: inherit;
  font-size: 0.875rem;
  background: var(--text-main);
  color: var(--bg);
  border: none;
  padding: 0.45rem 1.1rem;
  cursor: var(--cursor-pointer);
  transition: opacity 0.2s;
}
.btn-save:hover:not(:disabled) { opacity: 0.75; }
.btn-save:disabled { cursor: var(--cursor-not-allowed); }

.btn-save--saving,
.btn-save--saving:hover {
  opacity: 0.82;
}

.btn-delete {
  font-family: inherit;
  font-size: 0.875rem;
  background: none;
  border: none;
  color: #c0392b;
  cursor: var(--cursor-pointer);
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.edit-error {
  color: #c0392b;
  font-style: italic;
  font-size: 0.875rem;
  margin: 0 0 1rem 0;
}

.metrics-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 1rem 0;
  margin: -1rem 0 2rem;
}

.metrics-strip div {
  min-width: 0;
}

.metric-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.metrics-strip strong {
  font-size: 1.1rem;
  font-weight: 400;
  color: var(--text-main);
}

/* Meta fields */
.meta-fields {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  margin-bottom: 2rem;
}

.field-title {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  font-family: "Georgia", serif;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--text-main);
  padding: 0.3rem 0 0.6rem;
}
.field-title::placeholder { color: var(--border); }
.field-title:focus { border-bottom-color: var(--text-main); }

.field-row {
  display: flex;
  gap: 1.2rem;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
}

.field-group label {
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.field-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  font-family: inherit;
  font-size: 0.95rem;
  color: var(--text-main);
  padding: 0.35rem 0;
  width: 100%;
  transition: border-color 0.2s;
}
.field-input:focus { border-bottom-color: var(--text-main); }

/* A minute count needs a few characters, not the full column width. */
.field-input--narrow {
  width: 6rem;
}

.field-help {
  margin: 0.45rem 0 0;
  font-size: 0.8rem;
  font-style: italic;
}

/* Persistent live region: collapse the reserved space while empty without
   display:none, which would stop screen readers announcing later updates. */
.field-help:empty {
  margin: 0;
}

.field-help--ok {
  color: #3a7a3a;
}

.field-help--error {
  color: #c0392b;
}

.field-help--muted {
  color: var(--text-muted);
}

.field-textarea {
  background: transparent;
  border: 1px solid var(--border);
  font-family: "Georgia", serif;
  font-size: 0.9rem;
  color: var(--text-muted);
  padding: 0.6rem 0.8rem;
  resize: vertical;
  width: 100%;
  line-height: 1.6;
  transition: border-color 0.2s;
}
.field-textarea:focus { border-color: var(--text-main); }

.cover-preview {
  margin-top: 0.8rem;
  max-width: 100%;
  max-height: 12rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  object-fit: cover;
}

@media (max-width: 640px) {
  .metrics-strip {
    grid-template-columns: 1fr;
    gap: 0.8rem;
  }
}
</style>
