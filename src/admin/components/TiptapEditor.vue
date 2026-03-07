<template>
  <div class="editor-shell">
    <div class="toolbar">
      <button
        v-for="btn in toolbarButtons"
        :key="btn.label"
        class="tb-btn"
        :class="{ 'tb-btn--active': btn.isActive?.() }"
        @click="btn.action"
        :title="btn.label"
      >{{ btn.label }}</button>

      <!-- Image upload — separate from the v-for loop to use a ref -->
      <button class="tb-btn" title="Image" @click="fileInputRef.click()">Img</button>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="onFileSelected"
    />

    <EditorContent :editor="editor" class="editor-content" />

    <!-- Upload progress indicator -->
    <div v-if="uploading" class="upload-indicator">Reading image…</div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount, computed } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit   from '@tiptap/starter-kit'
import Placeholder  from '@tiptap/extension-placeholder'
import Typography   from '@tiptap/extension-typography'
import Underline    from '@tiptap/extension-underline'
import Link         from '@tiptap/extension-link'
import TextAlign    from '@tiptap/extension-text-align'
import Image        from '@tiptap/extension-image'

const props = defineProps({
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

// ─── File input ref ───────────────────────────────────────
const fileInputRef = ref(null)
const uploading    = ref(false)

// ─── Editor ──────────────────────────────────────────────
const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: 'Start writing…' }),
    Typography,
    Underline,
    Link.configure({ openOnClick: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ inline: false, allowBase64: true }),
  ],
  content: props.modelValue,
  onUpdate({ editor }) {
    emit('update:modelValue', editor.getJSON())
  },
})

// Sync when content is loaded from API
watch(() => props.modelValue, (val) => {
  if (!editor.value) return
  const current  = JSON.stringify(editor.value.getJSON())
  const incoming = JSON.stringify(val)
  if (current !== incoming) {
    editor.value.commands.setContent(val ?? '', false)
  }
})

onBeforeUnmount(() => editor.value?.destroy())

// ─── Image upload ─────────────────────────────────────────
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return

  if (file.size > MAX_SIZE) {
    alert(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`)
    e.target.value = ''
    return
  }

  uploading.value = true
  const reader = new FileReader()

  reader.onload = () => {
    editor.value?.chain().focus().setImage({ src: reader.result }).run()
    uploading.value = false
  }

  reader.onerror = () => {
    alert('Failed to read image file.')
    uploading.value = false
  }

  reader.readAsDataURL(file)
  // Reset so the same file can be re-selected
  e.target.value = ''
}

// ─── Toolbar ──────────────────────────────────────────────
const toolbarButtons = computed(() => {
  const e = editor.value
  if (!e) return []
  return [
    {
      label: 'B',
      isActive: () => e.isActive('bold'),
      action: () => e.chain().focus().toggleBold().run(),
    },
    {
      label: 'I',
      isActive: () => e.isActive('italic'),
      action: () => e.chain().focus().toggleItalic().run(),
    },
    {
      label: 'U',
      isActive: () => e.isActive('underline'),
      action: () => e.chain().focus().toggleUnderline().run(),
    },
    {
      label: 'H1',
      isActive: () => e.isActive('heading', { level: 1 }),
      action: () => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'H2',
      isActive: () => e.isActive('heading', { level: 2 }),
      action: () => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'H3',
      isActive: () => e.isActive('heading', { level: 3 }),
      action: () => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: '❝',
      isActive: () => e.isActive('blockquote'),
      action: () => e.chain().focus().toggleBlockquote().run(),
    },
    {
      label: '—',
      isActive: () => false,
      action: () => e.chain().focus().setHorizontalRule().run(),
    },
    {
      label: 'UL',
      isActive: () => e.isActive('bulletList'),
      action: () => e.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'OL',
      isActive: () => e.isActive('orderedList'),
      action: () => e.chain().focus().toggleOrderedList().run(),
    },
  ]
})
</script>

<style scoped>
.editor-shell {
  border: 1px solid var(--border);
  position: relative;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-bottom: 1px solid var(--border);
  padding: 0.4rem 0.6rem;
  background-color: var(--bg-subtle, var(--bg));
}

.tb-btn {
  background: none;
  border: none;
  font-family: inherit;
  font-size: 0.8rem;
  padding: 0.3rem 0.55rem;
  cursor: pointer;
  color: var(--text-muted);
  transition: color 0.15s;
  line-height: 1;
}
.tb-btn:hover  { color: var(--text-main); }
.tb-btn--active { color: var(--text-main); font-weight: 600; }

.upload-indicator {
  position: absolute;
  bottom: 0.8rem;
  right: 1rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  font-style: italic;
  pointer-events: none;
}
</style>

<!-- Global: ProseMirror content styles -->
<style>
.editor-content .ProseMirror {
  min-height: 420px;
  padding: 1.5rem;
  outline: none;
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 1rem;
  line-height: 1.8;
  color: var(--text-main);
}

.editor-content .ProseMirror p  { margin: 0 0 1.2em 0; }
.editor-content .ProseMirror h1 { font-size: 2rem; font-weight: 400; letter-spacing: -0.025em; margin: 1.5em 0 0.5em; }
.editor-content .ProseMirror h2 { font-size: 1.4rem; font-weight: 400; margin: 1.4em 0 0.5em; }
.editor-content .ProseMirror h3 { font-size: 1.1rem; font-weight: 400; margin: 1.2em 0 0.4em; }

.editor-content .ProseMirror blockquote {
  border-left: 1px solid var(--text-main);
  margin: 1.8em 0;
  padding-left: 1.2rem;
  color: var(--text-muted);
  font-style: italic;
}

.editor-content .ProseMirror hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 2.5rem 0;
}

.editor-content .ProseMirror ul,
.editor-content .ProseMirror ol {
  padding-left: 1.5rem;
  margin: 0 0 1.2em 0;
}
.editor-content .ProseMirror li { margin-bottom: 0.3em; }

/* ─── Image ─── */
.editor-content .ProseMirror img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.8em 0;
  /* Subtle warm tint to match the editorial palette */
  filter: brightness(0.98);
}

/* Selected state */
.editor-content .ProseMirror img.ProseMirror-selectednode {
  outline: 1px solid var(--text-muted);
  outline-offset: 3px;
}

/* Placeholder */
.editor-content .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
  pointer-events: none;
  float: left;
  height: 0;
  font-style: italic;
}
</style>
