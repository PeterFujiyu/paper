<template>
  <div class="edit-wrap">

    <header class="edit-header">
      <RouterLink to="/admin/notes" class="back-link">← Notes</RouterLink>
      <div class="edit-actions">
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
    <TiptapEditor v-if="!loading" v-model="form.content" />

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import TiptapEditor from '../components/TiptapEditor.vue'
import { apiFetch } from '../store'
import { confirmDialog } from '../../shared/dialog'
import type { NoteDocument, JsonValue } from '../../types/content'

const route  = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id && route.params.id !== 'new')
const noteId = computed(() => String(route.params.id ?? ''))

const form = reactive<{ content: JsonValue | null }>({ content: null })

const loading = ref(false)
const saving = ref(false)
const error  = ref('')

// Enable Save only when the editor holds something worth persisting; mirrors the
// server's empty-doc rejection so the button state matches the outcome.
function hasContent(content: JsonValue | null): boolean {
  if (!content) return false
  const json = JSON.stringify(content)
  return /"text":"[^"]/.test(json) || /"type":"(?:image|table|horizontalRule)"/.test(json)
}

const validationMessage = computed(() => (hasContent(form.content) ? '' : 'Write something to save.'))

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed'
}

onMounted(async () => {
  if (!isEdit.value) return
  loading.value = true
  try {
    const note = await apiFetch<NoteDocument>(`/note?id=${encodeURIComponent(noteId.value)}`)
    form.content = note.content ?? null
  } catch (e: unknown) {
    error.value = getErrorMessage(e)
  } finally {
    loading.value = false
  }
})

async function save() {
  if (saving.value || validationMessage.value) return

  saving.value = true
  error.value  = ''
  try {
    if (isEdit.value) {
      await apiFetch<NoteDocument>(`/note?id=${encodeURIComponent(noteId.value)}`, {
        method: 'PUT',
        body: JSON.stringify({ content: form.content }),
      })
    } else {
      const note = await apiFetch<NoteDocument>('/notes', {
        method: 'POST',
        body: JSON.stringify({ content: form.content }),
      })
      router.replace(`/admin/notes/${note._id}`)
    }
  } catch (e: unknown) {
    error.value = getErrorMessage(e)
  } finally {
    saving.value = false
  }
}

async function remove() {
  const confirmed = await confirmDialog({
    title: 'Delete note',
    message: 'Delete this note? This cannot be undone.',
    confirmText: 'Delete',
    tone: 'danger',
  })
  if (!confirmed) return
  await apiFetch<{ ok: boolean }>(`/note?id=${encodeURIComponent(noteId.value)}`, { method: 'DELETE' })
  router.push('/admin/notes')
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
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-save:hover { opacity: 0.75; }
.btn-save:disabled { opacity: 0.4; cursor: default; }
.btn-save--saving { opacity: 0.6; }

.btn-delete {
  font-family: inherit;
  font-size: 0.875rem;
  background: none;
  border: none;
  color: var(--accent-ink);
  cursor: pointer;
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
</style>
