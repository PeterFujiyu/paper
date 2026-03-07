<template>
  <div class="edit-wrap">

    <!-- Meta bar -->
    <header class="edit-header">
      <RouterLink to="/admin" class="back-link">← Posts</RouterLink>
      <div class="edit-actions">
        <label class="publish-toggle">
          <input type="checkbox" v-model="form.published" />
          <span>{{ form.published ? 'Live' : 'Draft' }}</span>
        </label>
        <button class="btn-save" @click="save" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button v-if="isEdit" class="btn-delete" @click="remove">Delete</button>
      </div>
    </header>

    <p v-if="error" class="edit-error">{{ error }}</p>

    <!-- Title + meta fields -->
    <div class="meta-fields">
      <input
        v-model="form.title"
        class="field-title"
        placeholder="Post title"
        @blur="autoSlug"
      />
      <div class="field-row">
        <div class="field-group">
          <label>Slug</label>
          <input v-model="form.slug" class="field-input" placeholder="url-slug" />
        </div>
      </div>
      <div class="field-group">
        <label>Excerpt</label>
        <textarea v-model="form.excerpt" class="field-textarea" rows="2" placeholder="One or two sentences for the listing page." />
      </div>
    </div>

    <!-- Body editor -->
    <TiptapEditor v-model="form.content" />

  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import { apiFetch } from '../store.js'
import TiptapEditor from '../components/TiptapEditor.vue'

const route  = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id && route.params.id !== 'new')

const form = reactive({
  title:     '',
  slug:      '',
  excerpt:   '',
  content:   null,
  published: false,
})

const saving = ref(false)
const error  = ref('')

onMounted(async () => {
  if (!isEdit.value) return
  const post = await apiFetch(`/posts/admin/${route.params.id}`)
  Object.assign(form, {
    title:     post.title,
    slug:      post.slug,
    excerpt:   post.excerpt ?? '',
    content:   post.content ?? null,
    published: post.published,
  })
})

function autoSlug() {
  if (!form.slug && form.title) {
    form.slug = form.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }
}

async function save() {
  saving.value = true
  error.value  = ''
  try {
    if (isEdit.value) {
      await apiFetch(`/posts/${route.params.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      })
    } else {
      const post = await apiFetch('/posts', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      router.replace(`/admin/posts/${post._id}`)
    }
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm('Delete this post? This cannot be undone.')) return
  await apiFetch(`/posts/${route.params.id}`, { method: 'DELETE' })
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

.publish-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  cursor: pointer;
}
.publish-toggle input { accent-color: var(--text-main); }

.btn-save {
  font-family: inherit;
  font-size: 0.875rem;
  background: var(--text-main);
  color: var(--bg);
  border: none;
  padding: 0.45rem 1.1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-save:hover:not(:disabled) { opacity: 0.75; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-delete {
  font-family: inherit;
  font-size: 0.875rem;
  background: none;
  border: none;
  color: #c0392b;
  cursor: pointer;
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
  outline: none;
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
  outline: none;
  width: 100%;
  transition: border-color 0.2s;
}
.field-input:focus { border-bottom-color: var(--text-main); }

.field-textarea {
  background: transparent;
  border: 1px solid var(--border);
  font-family: "Georgia", serif;
  font-size: 0.9rem;
  color: var(--text-muted);
  padding: 0.6rem 0.8rem;
  outline: none;
  resize: vertical;
  width: 100%;
  line-height: 1.6;
  transition: border-color 0.2s;
}
.field-textarea:focus { border-color: var(--text-main); }
</style>
