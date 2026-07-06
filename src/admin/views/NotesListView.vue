<template>
  <div class="admin-wrap">
    <header class="admin-header">
      <h1 class="admin-title">Notes</h1>
      <div class="admin-header-actions">
        <RouterLink to="/admin" class="btn-ghost">Writing</RouterLink>
        <RouterLink to="/admin/notes/new" class="btn-primary">New note</RouterLink>
        <button class="btn-ghost" @click="signOut">Sign out</button>
      </div>
    </header>

    <div role="status">
      <p v-if="loading" class="state-msg">Loading…</p>
    </div>
    <div v-if="!loading && !notes.length" class="state-msg state-msg--empty">
      No notes yet. <RouterLink to="/admin/notes/new">Write one.</RouterLink>
    </div>

    <ol v-if="!loading && notes.length" class="note-list">
      <li v-for="note in notes" :key="note._id" class="note-item">
        <RouterLink :to="`/admin/notes/${note._id}`" class="note-row">
          <span class="note-preview">{{ preview(note.content) }}</span>
          <span class="note-date">{{ formatDate(note.createdAt) }}</span>
        </RouterLink>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { apiFetch, logout } from '../store'
import { renderContentHTML } from '../../shared/tiptap-extensions'
import type { NoteSummary, JsonValue } from '../../types/content'

const router = useRouter()
const notes = ref<NoteSummary[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    notes.value = await apiFetch<NoteSummary[]>('/admin-notes')
  } finally {
    loading.value = false
  }
})

// A short plain-text preview of the note body for the list row.
function preview(content: JsonValue | null): string {
  const html = renderContentHTML(content)
  const text = (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim()
  if (!text) return 'Untitled note'
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function signOut() {
  await logout()
  router.push('/admin/login')
}
</script>

<style scoped>
.admin-wrap {
  max-width: 56rem;
  margin: 0 auto;
  padding: 3rem 1.5rem;
}

.admin-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding-bottom: 1.5rem;
  margin-bottom: 3rem;
}

.admin-title {
  font-size: 1.5rem;
  font-weight: 400;
  margin: 0;
}

.admin-header-actions {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.btn-primary {
  font-family: inherit;
  font-size: 0.875rem;
  background: var(--text-main);
  color: var(--bg);
  padding: 0.45rem 1rem;
  text-decoration: none;
  transition: opacity 0.2s;
}
.btn-primary:hover { opacity: 0.75; }

.btn-ghost {
  font-family: inherit;
  font-size: 0.875rem;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  transition: color 0.2s;
}
.btn-ghost:hover { color: var(--text-main); }

.state-msg {
  color: var(--text-muted);
  font-style: italic;
  font-size: 1rem;
}
.state-msg a {
  color: var(--text-main);
}

.note-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.note-item {
  border-bottom: 1px solid var(--border);
}
.note-item:first-child {
  border-top: 1px solid var(--border);
}

.note-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 1.1rem 0;
  text-decoration: none;
  color: inherit;
  gap: 1.5rem;
}

.note-preview {
  font-size: 1rem;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: text-decoration 0.15s;
}
.note-row:hover .note-preview {
  text-decoration: underline;
  text-underline-offset: 4px;
}

.note-date {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
  white-space: nowrap;
}
</style>
