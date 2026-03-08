<template>
  <div class="admin-wrap">
    <header class="admin-header">
      <h1 class="admin-title">Writing</h1>
      <div class="admin-header-actions">
        <RouterLink to="/admin/posts/new" class="btn-primary">New post</RouterLink>
        <button class="btn-ghost" @click="logout">Sign out</button>
      </div>
    </header>

    <div v-if="loading" class="state-msg">Loading…</div>
    <div v-else-if="!posts.length" class="state-msg state-msg--empty">
      No posts yet. <RouterLink to="/admin/posts/new">Write one.</RouterLink>
    </div>

    <ol v-else class="post-list">
      <li v-for="post in posts" :key="post._id" class="post-item">
        <RouterLink :to="`/admin/posts/${post._id}`" class="post-row">
          <div class="post-info">
            <span class="post-status" :class="post.published ? 'status--live' : 'status--draft'">
              {{ post.published ? 'Live' : 'Draft' }}
            </span>
            <span class="post-title">{{ post.title }}</span>
          </div>
          <span class="post-date">{{ formatDate(post.createdAt) }}</span>
        </RouterLink>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { apiFetch, clearAuth } from '../store'
import type { PostSummary } from '../../types/content'

const router = useRouter()
const posts = ref<PostSummary[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    posts.value = await apiFetch<PostSummary[]>('/admin-posts')
  } finally {
    loading.value = false
  }
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function logout() {
  clearAuth()
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

.post-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.post-item {
  border-bottom: 1px solid var(--border);
}
.post-item:first-child {
  border-top: 1px solid var(--border);
}

.post-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 1.1rem 0;
  text-decoration: none;
  color: inherit;
  gap: 1rem;
}

.post-info {
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
}

.post-status {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.15rem 0.5rem;
  border: 1px solid currentColor;
}
.status--live  { color: #3a7a3a; }
.status--draft { color: var(--text-muted); }

.post-title {
  font-size: 1rem;
  color: var(--text-main);
  transition: text-decoration 0.15s;
}
.post-row:hover .post-title {
  text-decoration: underline;
  text-underline-offset: 4px;
}

.post-date {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
  white-space: nowrap;
}
</style>
