<template>
  <main>

    <div v-if="loading" class="state-msg">Loading…</div>

    <!-- 404 -->
    <div v-else-if="!post" class="not-found">
      <p class="not-found-code">404</p>
      <p class="not-found-msg">This essay doesn't exist.</p>
      <RouterLink to="/" class="back-link">← Back to writing</RouterLink>
    </div>

    <!-- Article -->
    <article v-else class="post">
      <header class="post-header">
        <RouterLink to="/" class="back-link">← Writing</RouterLink>
        <div class="post-meta">{{ formatDate(post.createdAt) }}</div>
        <h1 class="post-title">{{ post.title }}</h1>
      </header>

      <!-- Render Tiptap JSON as HTML via generateHTML -->
      <div class="post-body prose" v-html="renderedHTML" />

      <footer class="post-footer">
        <RouterLink to="/" class="back-link">← Back to writing</RouterLink>
      </footer>
    </article>

  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { generateHTML, type Extensions, type JSONContent } from '@tiptap/core'
import StarterKit   from '@tiptap/starter-kit'
import Image        from '@tiptap/extension-image'
import Typography   from '@tiptap/extension-typography'
import Underline    from '@tiptap/extension-underline'
import Link         from '@tiptap/extension-link'
import TextAlign    from '@tiptap/extension-text-align'
import type { PostDocument } from '../types/content'

const props = defineProps({
  slug: { type: String, required: true },
})

const post = ref<PostDocument | null>(null)
const loading = ref(true)

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE}/post?slug=${encodeURIComponent(props.slug)}`)
    if (!res.ok) { post.value = null; return }
    post.value = await res.json() as PostDocument
  } finally {
    loading.value = false
  }
})

const extensions: Extensions = [
  StarterKit,
  Image.configure({ allowBase64: true }),
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

function formatDate(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
</script>

<style scoped>
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
.back-link:hover { color: var(--text-main); }

.post-header { margin-bottom: 3rem; }

.post-meta {
  font-size: 0.875rem;
  color: var(--text-muted);
  font-style: italic;
  margin-bottom: 1rem;
}

.post-title {
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.025em;
  margin: 0;
  color: var(--text-main);
}

.post-body {
  border-top: 1px solid var(--border);
  padding-top: 2.5rem;
}

.post-footer {
  margin-top: 4rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}

.not-found { padding: 4rem 0; }

.not-found-code {
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
</style>

<!-- prose: render Tiptap HTML in Editorial style -->
<style>
.prose { font-family: "Georgia", "Times New Roman", serif; }
.prose p  { font-size: 1rem; line-height: 1.8; margin: 0 0 1.6em; color: var(--text-main); }
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
.prose img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 2rem auto;
}
.prose a   { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 4px; }
.prose a:hover { text-decoration-thickness: 2px; }
.prose strong { font-weight: 600; }
</style>
