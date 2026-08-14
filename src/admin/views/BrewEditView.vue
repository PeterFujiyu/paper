<template>
  <div class="edit-wrap">

    <header class="edit-header">
      <RouterLink to="/admin/brews" class="back-link">← Coffee</RouterLink>
      <div class="edit-actions">
        <!-- A draft cup is one an agent logged over MCP; this puts it on the
             log and into the shelf totals. -->
        <PublicationToggle v-if="isEdit" v-model="published" />
        <button class="btn-save" :class="{ 'btn-save--saving': saving }" @click="save" :disabled="saving || !!validationMessage">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button v-if="isEdit" class="btn-delete" @click="remove">Delete</button>
      </div>
    </header>

    <p v-if="error || validationMessage" class="edit-error" role="alert">{{ error || validationMessage }}</p>

    <div role="status">
      <p v-if="loading" class="state-msg">Loading…</p>
    </div>

    <form v-if="!loading" class="brew-form" @submit.prevent="save">

      <fieldset class="field-group">
        <legend class="group-legend">The bean</legend>

        <label class="field">
          <span class="field-label">Bean</span>
          <input v-model="form.bean" type="text" class="field-input" :maxlength="MAX_BEAN_LENGTH" placeholder="Kochere" />
        </label>

        <div class="field-row">
          <label class="field">
            <span class="field-label">Origin</span>
            <input v-model="form.origin" type="text" class="field-input" :maxlength="MAX_ORIGIN_LENGTH" placeholder="Ethiopia" />
          </label>

          <label class="field">
            <span class="field-label">Roaster</span>
            <input v-model="form.roaster" type="text" class="field-input" :maxlength="MAX_ROASTER_LENGTH" placeholder="Passenger" />
          </label>
        </div>
      </fieldset>

      <fieldset class="field-group">
        <legend class="group-legend">The recipe</legend>

        <div class="field-row">
          <label class="field">
            <span class="field-label">Method</span>
            <select v-model="form.method" class="field-input">
              <option v-for="method in BREW_METHODS" :key="method" :value="method">{{ method }}</option>
            </select>
          </label>

          <label class="field">
            <span class="field-label">Rating</span>
            <select v-model.number="form.rating" class="field-input">
              <option :value="0">Unrated</option>
              <option v-for="score in MAX_RATING" :key="score" :value="score">{{ score }} / {{ MAX_RATING }}</option>
            </select>
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span class="field-label">Dose <span class="field-unit">grams</span></span>
            <input v-model.number="form.dose" type="number" class="field-input" min="0" :max="MAX_DOSE_GRAMS" step="0.1" placeholder="18" />
          </label>

          <label class="field">
            <span class="field-label">Water <span class="field-unit">grams</span></span>
            <input v-model.number="form.water" type="number" class="field-input" min="0" :max="MAX_WATER_GRAMS" step="1" placeholder="300" />
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span class="field-label">Temperature <span class="field-unit">°C</span></span>
            <input v-model.number="form.temperature" type="number" class="field-input" :min="MIN_TEMPERATURE_C" :max="MAX_TEMPERATURE_C" step="1" placeholder="94" />
          </label>

          <label class="field">
            <span class="field-label">Brew time <span class="field-unit">mm:ss</span></span>
            <input v-model="brewTimeText" type="text" class="field-input" placeholder="3:15" />
          </label>
        </div>

        <p v-if="ratioPreview" class="ratio-preview">Ratio {{ ratioPreview }}</p>
      </fieldset>

      <fieldset class="field-group">
        <legend class="group-legend">The cup</legend>

        <label class="field">
          <span class="field-label">Tasting note</span>
          <textarea
            v-model="form.tastingNote"
            class="field-input field-input--area"
            rows="4"
            :maxlength="MAX_TASTING_NOTE_LENGTH"
            placeholder="Jasmine up front, then a long lemon finish."
          ></textarea>
          <span class="field-count">{{ form.tastingNote.length }} / {{ MAX_TASTING_NOTE_LENGTH }}</span>
        </label>

        <label class="field">
          <span class="field-label">Brewed alongside <span class="field-unit">essay slug, optional</span></span>
          <input v-model="form.pairedSlug" type="text" class="field-input" placeholder="on-the-em-dash" />
        </label>
      </fieldset>

    </form>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import PublicationToggle from '../components/PublicationToggle.vue'
import { apiFetch } from '../store'
import { confirmDialog } from '../../shared/dialog'
import {
  BREW_METHODS,
  brewTimeInput,
  formatRatio,
  MAX_BEAN_LENGTH,
  MAX_DOSE_GRAMS,
  MAX_ORIGIN_LENGTH,
  MAX_RATING,
  MAX_ROASTER_LENGTH,
  MAX_TASTING_NOTE_LENGTH,
  MAX_TEMPERATURE_C,
  MAX_WATER_GRAMS,
  MIN_TEMPERATURE_C,
  parseBrewTime,
} from '../../shared/brew'
import type { BrewDocument, BrewForm } from '../../types/content'

const route  = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id && route.params.id !== 'new')
const brewId = computed(() => String(route.params.id ?? ''))

const form = reactive<BrewForm>({
  bean: '',
  origin: '',
  roaster: '',
  method: BREW_METHODS[3], // V60 — the everyday pour, and the likeliest entry
  dose: null,
  water: null,
  temperature: null,
  brewSeconds: null,
  rating: 0,
  tastingNote: '',
  pairedSlug: '',
})

// Held as text so a half-typed "3:" isn't rewritten under the author's cursor;
// parsed on save and on every keystroke for the validation message.
const brewTimeText = ref('')

// A cup logged here goes on the log, as it always has; only an existing one can
// be a draft, and only the toggle above changes that.
const published = ref(true)

const loading = ref(false)
const saving = ref(false)
const error  = ref('')

const parsedBrewSeconds = computed(() => parseBrewTime(brewTimeText.value))

const ratioPreview = computed(() => formatRatio(form.dose ?? 0, form.water ?? 0))

const validationMessage = computed(() => {
  if (!form.bean.trim()) return 'A bean name is required.'
  if (parsedBrewSeconds.value === null) return 'Brew time should look like 3:15, or a number of seconds.'
  return ''
})

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed'
}

onMounted(async () => {
  if (!isEdit.value) return
  loading.value = true
  try {
    const brew = await apiFetch<BrewDocument>(`/brew?id=${encodeURIComponent(brewId.value)}`)
    form.bean = brew.bean
    form.origin = brew.origin
    form.roaster = brew.roaster
    form.method = brew.method
    // 0 is the stored "unrecorded"; the inputs want to be empty for it.
    form.dose = brew.dose || null
    form.water = brew.water || null
    form.temperature = brew.temperature || null
    form.rating = brew.rating
    form.tastingNote = brew.tastingNote
    form.pairedSlug = brew.pairedSlug
    brewTimeText.value = brewTimeInput(brew.brewSeconds)
    published.value = brew.published !== false
  } catch (e: unknown) {
    error.value = getErrorMessage(e)
  } finally {
    loading.value = false
  }
})

function payload(): Record<string, unknown> {
  return {
    bean: form.bean,
    origin: form.origin,
    roaster: form.roaster,
    method: form.method,
    dose: form.dose,
    water: form.water,
    temperature: form.temperature,
    brewSeconds: parsedBrewSeconds.value,
    rating: form.rating,
    tastingNote: form.tastingNote,
    pairedSlug: form.pairedSlug,
  }
}

async function save() {
  if (saving.value || validationMessage.value) return

  saving.value = true
  error.value  = ''
  try {
    if (isEdit.value) {
      await apiFetch<BrewDocument>(`/brew?id=${encodeURIComponent(brewId.value)}`, {
        method: 'PUT',
        body: JSON.stringify({ ...payload(), published: published.value }),
      })
    } else {
      const brew = await apiFetch<BrewDocument>('/brews', {
        method: 'POST',
        body: JSON.stringify(payload()),
      })
      router.replace(`/admin/brews/${brew._id}`)
    }
  } catch (e: unknown) {
    error.value = getErrorMessage(e)
  } finally {
    saving.value = false
  }
}

async function remove() {
  const confirmed = await confirmDialog({
    title: 'Delete brew',
    message: 'Delete this brew? This cannot be undone.',
    confirmText: 'Delete',
    tone: 'danger',
  })
  if (!confirmed) return
  await apiFetch<{ ok: boolean }>(`/brew?id=${encodeURIComponent(brewId.value)}`, { method: 'DELETE' })
  router.push('/admin/brews')
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
  margin-bottom: 2rem;
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
  gap: 1rem;
  align-items: center;
}

.btn-save {
  font-family: inherit;
  font-size: 0.875rem;
  background: var(--text-main);
  color: var(--bg);
  border: none;
  padding: 0.45rem 1.2rem;
  cursor: var(--cursor-pointer);
  transition: opacity 0.2s;
}
.btn-save:hover { opacity: 0.75; }
.btn-save:disabled { opacity: 0.4; cursor: var(--cursor-default); }
.btn-save--saving { opacity: 0.6; }

.btn-delete {
  font-family: inherit;
  font-size: 0.875rem;
  background: none;
  border: none;
  color: var(--accent-ink);
  cursor: var(--cursor-pointer);
  padding: 0;
  transition: opacity 0.2s;
}
.btn-delete:hover { opacity: 0.75; }

.edit-error {
  color: var(--accent-ink);
  font-size: 0.875rem;
  margin: 0 0 1.5rem 0;
}

.state-msg {
  color: var(--text-muted);
  font-style: italic;
}

/* ─── Form ─── */
.brew-form {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

.field-group {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0;
  padding: 1.5rem 0 0 0;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.group-legend {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 0 0.6rem 0 0;
}

.field-row {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.field-row .field {
  flex: 1 1 12rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field-label {
  font-family: var(--font-sans);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--text-main);
}

.field-unit {
  color: var(--text-muted);
  font-style: italic;
  letter-spacing: 0;
}

.field-input {
  font-family: inherit;
  font-size: 0.95rem;
  color: var(--text-main);
  background: var(--bg);
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  padding: 0.4rem 0;
  transition: border-color 0.2s ease;
}

.field-input:focus {
  outline: none;
  border-bottom-color: var(--accent);
}

/* The focus ring is suppressed above in favour of the underline, so restore a
   visible one for keyboard users specifically. */
.field-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.field-input::placeholder {
  color: var(--text-muted);
  opacity: 0.7;
}

.field-input--area {
  resize: vertical;
  line-height: 1.6;
}

.field-count {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  color: var(--text-muted);
  text-align: right;
}

.ratio-preview {
  font-family: var(--font-sans);
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  color: var(--accent-ink);
  margin: 0;
}
</style>
