<template>
  <div class="admin-wrap">
    <header class="admin-header">
      <h1 class="admin-title">Coffee</h1>
      <div class="admin-header-actions">
        <RouterLink to="/admin" class="btn-ghost">Writing</RouterLink>
        <RouterLink to="/admin/notes" class="btn-ghost">Notes</RouterLink>
        <RouterLink to="/admin/brews/new" class="btn-primary">Log a brew</RouterLink>
        <button class="btn-ghost" @click="signOut">Sign out</button>
      </div>
    </header>

    <div role="status">
      <p v-if="loading" class="state-msg">Loading…</p>
    </div>
    <div v-if="!loading && !brews.length" class="state-msg state-msg--empty">
      <EditorialArt name="empty-cup" class="empty-art" />
      <p>Nothing brewed yet. <RouterLink to="/admin/brews/new">Log one.</RouterLink></p>
    </div>

    <ol v-if="!loading && brews.length" class="brew-list">
      <li v-for="brew in brews" :key="brew._id" class="brew-item">
        <RouterLink :to="`/admin/brews/${brew._id}`" class="brew-row">
          <span class="brew-name">
            {{ brew.bean }}<span v-if="brew.origin" class="brew-origin"> · {{ brew.origin }}</span>
          </span>
          <span class="brew-side">
            <!-- Only drafts are marked; a cup on the log is the ordinary case. -->
            <span v-if="brew.published === false" class="brew-status">Draft</span>
            <span class="brew-method">{{ brew.method }}</span>
            <span class="brew-date">{{ formatDate(brew.createdAt) }}</span>
          </span>
        </RouterLink>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { apiFetch, logout } from '../store'
import EditorialArt from '../../components/EditorialArt.vue'
import type { BrewSummary } from '../../types/content'

const router = useRouter()
const brews = ref<BrewSummary[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    brews.value = await apiFetch<BrewSummary[]>('/admin-brews')
  } finally {
    loading.value = false
  }
})

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
  cursor: var(--cursor-pointer);
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

.state-msg--empty {
  display: flex;
  align-items: center;
  gap: 1.4rem;
  padding: 1.5rem 0;
}

.state-msg--empty p {
  margin: 0;
}

.empty-art {
  width: 5rem;
  height: 5rem;
}

.brew-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.brew-item {
  border-bottom: 1px solid var(--border);
}
.brew-item:first-child {
  border-top: 1px solid var(--border);
}

.brew-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 1.1rem 0;
  text-decoration: none;
  color: inherit;
  gap: 1.5rem;
}

/* Matches the essay and note lists' status chip. */
.brew-status {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.15rem 0.5rem;
  border: 1px solid currentColor;
  color: var(--text-muted);
  white-space: nowrap;
}

.brew-name {
  font-size: 1rem;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: text-decoration 0.15s;
}
.brew-row:hover .brew-name {
  text-decoration: underline;
  text-underline-offset: 4px;
}

.brew-origin {
  color: var(--text-muted);
}

.brew-side {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  white-space: nowrap;
}

.brew-method {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.brew-date {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
}
</style>
