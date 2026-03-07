<template>
  <main>

    <!-- ─── Hero ─── -->
    <section class="hero">
      <p class="hero-label">Designer &amp; Creative</p>
      <h1 class="hero-title">
        Thinking through design,<br>
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
      <h2 class="section-heading">Writing</h2>

      <div v-if="loading" class="state-msg">Loading…</div>
      <p v-else-if="!posts.length" class="state-msg">No posts yet.</p>

      <ol v-else class="article-list">
        <li v-for="post in posts" :key="post._id" class="article-item">
          <RouterLink :to="{ name: 'post', params: { slug: post.slug } }" class="article-link">
            <div class="article-meta">{{ formatDate(post.createdAt) }}</div>
            <h3 class="article-title">{{ post.title }}</h3>
            <p class="article-excerpt">{{ post.excerpt }}</p>
          </RouterLink>
        </li>
      </ol>
    </section>

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
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import type { PostSummary } from '../types/content'

const posts = ref<PostSummary[]>([])
const loading = ref(true)

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE}/posts`)
    if (res.ok) posts.value = await res.json() as PostSummary[]
  } finally {
    loading.value = false
  }
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
</script>

<style scoped>
/* ─── Hero ─── */
.hero {
  margin-bottom: 4rem;
}

.hero-label {
  font-size: 0.875rem;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 1.2rem;
}

.hero-title {
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: -0.03em;
  margin: 0 0 1.5rem 0;
  color: var(--text-main);
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
  font-size: 0.75rem;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 2.5rem 0;
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
  padding: 1.6rem 0;
  text-decoration: none;
  color: inherit;
}

.article-link:hover .article-title {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}

.article-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.4rem;
  font-style: italic;
}

.article-title {
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
  text-decoration-thickness: 2px;
}
</style>
