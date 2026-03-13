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
      <button class="tb-btn" title="Image" @click="fileInputRef?.click()">Img</button>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="onFileSelected"
    />

    <div class="editor-content-wrap">
      <EditorContent :editor="editor" class="editor-content" />

      <!-- Table context toolbar — appears at top-right of table when cursor is inside -->
      <Teleport to="body">
        <Transition name="tbl-fade">
          <div
            v-if="tableToolbarVisible && tableToolbarPos"
            class="table-toolbar"
            :style="{ top: tableToolbarPos.top + 'px', left: tableToolbarPos.left + 'px' }"
            @mousedown.prevent
          >
            <!-- Add row below -->
            <button class="tbl-btn" title="Add row below" @click="editorCmd('addRowAfter')">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="12" height="5" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
                <rect x="1" y="8" width="12" height="5" rx="0.5" stroke="currentColor" stroke-width="1.1" stroke-dasharray="2 1.5"/>
                <line x1="7" y1="9.5" x2="7" y2="11.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                <line x1="6" y1="10.5" x2="8" y2="10.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
              </svg>
            </button>

            <!-- Delete row -->
            <button class="tbl-btn" title="Delete row" @click="editorCmd('deleteRow')">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="12" height="5" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
                <rect x="1" y="8" width="12" height="5" rx="0.5" stroke="currentColor" stroke-width="1.1" opacity="0.35"/>
                <line x1="5.5" y1="9.5" x2="8.5" y2="11.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                <line x1="8.5" y1="9.5" x2="5.5" y2="11.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
              </svg>
            </button>

            <div class="tbl-sep"></div>

            <!-- Add column right -->
            <button class="tbl-btn" title="Add column right" @click="editorCmd('addColumnAfter')">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="5" height="12" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
                <rect x="8" y="1" width="5" height="12" rx="0.5" stroke="currentColor" stroke-width="1.1" stroke-dasharray="2 1.5"/>
                <line x1="9.5" y1="7" x2="11.5" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                <line x1="10.5" y1="6" x2="10.5" y2="8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
              </svg>
            </button>

            <!-- Delete column -->
            <button class="tbl-btn" title="Delete column" @click="editorCmd('deleteColumn')">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="5" height="12" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
                <rect x="8" y="1" width="5" height="12" rx="0.5" stroke="currentColor" stroke-width="1.1" opacity="0.35"/>
                <line x1="9.5" y1="5.5" x2="11.5" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                <line x1="11.5" y1="5.5" x2="9.5" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
              </svg>
            </button>

            <div class="tbl-sep"></div>

            <!-- Delete table -->
            <button class="tbl-btn tbl-btn--danger" title="Delete table" @click="editorCmd('deleteTable')">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="12" height="12" rx="0.5" stroke="currentColor" stroke-width="1.1" opacity="0.4"/>
                <line x1="4" y1="4" x2="10" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <line x1="10" y1="4" x2="4" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </Transition>
      </Teleport>
    </div>

    <!-- Upload progress indicator -->
    <div v-if="uploading" class="upload-indicator">Reading image…</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit   from '@tiptap/starter-kit'
import Placeholder  from '@tiptap/extension-placeholder'
import Typography   from '@tiptap/extension-typography'
import Underline    from '@tiptap/extension-underline'
import Link         from '@tiptap/extension-link'
import TextAlign    from '@tiptap/extension-text-align'
import Image        from '@tiptap/extension-image'
import { Table }    from '@tiptap/extension-table'
import TableRow     from '@tiptap/extension-table-row'
import TableHeader  from '@tiptap/extension-table-header'
import TableCell    from '@tiptap/extension-table-cell'
import type { JsonValue } from '../../types/content'

const props = defineProps({
  modelValue: { type: Object as () => JsonValue | null, default: null },
})
const emit = defineEmits(['update:modelValue'])

// ─── File input ref ───────────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

// ─── Table toolbar state ──────────────────────────────────
const tableToolbarVisible = ref(false)
const tableToolbarPos = ref<{ top: number; left: number } | null>(null)

function updateTableToolbar() {
  const e = editor.value
  if (!e) { tableToolbarVisible.value = false; return }

  const inTable = e.isActive('table')
  tableToolbarVisible.value = inTable

  if (!inTable) return

  // Find the tableWrapper DOM node for the currently selected table
  const { state, view } = e
  const { $from } = state.selection

  // Walk up the ProseMirror node tree to find the table node
  let tablePos: number | null = null
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === 'table') {
      tablePos = $from.before(d)
      break
    }
  }

  if (tablePos === null) return

  const tableDOM = view.nodeDOM(tablePos) as HTMLElement | null
  if (!tableDOM) return

  // tableWrapper is the parent of the <table> element injected by Tiptap
  const wrapper = tableDOM.closest('.tableWrapper') ?? tableDOM
  const rect = wrapper.getBoundingClientRect()

  // Position the toolbar at the top-right corner of the table wrapper
  tableToolbarPos.value = {
    top: rect.top + window.scrollY - 2,
    left: rect.right + window.scrollX + 6,
  }
}

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
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ],
  content: props.modelValue,
  onUpdate({ editor: e }) {
    emit('update:modelValue', e.getJSON())
    updateTableToolbar()
  },
  onSelectionUpdate() {
    updateTableToolbar()
  },
  onFocus() {
    updateTableToolbar()
  },
  onBlur() {
    // Small delay so clicks on the table toolbar are not lost
    setTimeout(() => {
      if (editor.value && !editor.value.isFocused) {
        tableToolbarVisible.value = false
      }
    }, 150)
  },
})

// Sync when content is loaded from API
watch(() => props.modelValue, (val) => {
  if (!editor.value) return
  const current  = JSON.stringify(editor.value.getJSON())
  const incoming = JSON.stringify(val)
  if (current !== incoming) {
    editor.value.commands.setContent(val ?? '', { emitUpdate: false })
  }
})

onBeforeUnmount(() => editor.value?.destroy())

// ─── Table command helper ─────────────────────────────────
type TableCmd = 'addRowAfter' | 'deleteRow' | 'addColumnAfter' | 'deleteColumn' | 'deleteTable'

function editorCmd(cmd: TableCmd) {
  const e = editor.value
  if (!e) return
  ;(e.chain().focus() as any)[cmd]().run()
  updateTableToolbar()
}

// ─── Image upload ─────────────────────────────────────────
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

function onFileSelected(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (file.size > MAX_SIZE) {
    alert(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`)
    target.value = ''
    return
  }

  uploading.value = true
  const reader = new FileReader()

  reader.onload = () => {
    if (typeof reader.result === 'string') {
      editor.value?.chain().focus().setImage({ src: reader.result }).run()
    }
    uploading.value = false
    target.value = ''
  }

  reader.onerror = () => {
    alert('Failed to read image file.')
    uploading.value = false
    target.value = ''
  }

  reader.readAsDataURL(file)
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
    {
      label: 'Tbl',
      isActive: () => false,
      action: () => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
  ] as Array<{ label: string; isActive?: () => boolean; action: () => void }>
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

.editor-content-wrap {
  position: relative;
}

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

<!-- Table context toolbar — global so Teleport target (body) works -->
<style>
.table-toolbar {
  position: absolute;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 3px;
  background: var(--bg, #fff);
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 5px;
  box-shadow: 0 2px 8px color-mix(in srgb, currentColor 8%, transparent);
}

.tbl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: none;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  color: var(--text-muted, #888);
  transition: color 0.12s, background 0.12s;
  padding: 0;
}
.tbl-btn:hover {
  color: var(--text-main, #111);
  background: color-mix(in srgb, currentColor 7%, transparent);
}
.tbl-btn--danger:hover {
  color: #c0392b;
  background: color-mix(in srgb, #c0392b 8%, transparent);
}

.tbl-sep {
  width: 14px;
  height: 1px;
  background: var(--border, #e5e5e5);
  margin: 1px 0;
  flex-shrink: 0;
}

/* Transition */
.tbl-fade-enter-active,
.tbl-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.tbl-fade-enter-from,
.tbl-fade-leave-to {
  opacity: 0;
  transform: translateX(3px);
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

.editor-content .ProseMirror .tableWrapper {
  margin: 2rem 0;
  overflow-x: auto;
}

.editor-content .ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  table-layout: fixed;
  overflow: hidden;
}

.editor-content .ProseMirror th,
.editor-content .ProseMirror td {
  border: 1px solid var(--border);
  padding: 0.7rem 0.8rem;
  vertical-align: top;
  text-align: left;
}

.editor-content .ProseMirror th {
  font-weight: 600;
  background: var(--bg-subtle, var(--bg));
}

.editor-content .ProseMirror .column-resize-handle {
  position: absolute;
  top: 0;
  right: -2px;
  bottom: -1px;
  width: 4px;
  background: color-mix(in srgb, var(--text-main) 28%, transparent);
  pointer-events: none;
}

.editor-content .ProseMirror.resize-cursor {
  cursor: col-resize;
}

.editor-content .ProseMirror.resize-cursor th,
.editor-content .ProseMirror.resize-cursor td {
  background-image: linear-gradient(
    to right,
    transparent calc(100% - 1px),
    color-mix(in srgb, var(--text-main) 16%, transparent) calc(100% - 1px)
  );
  background-repeat: no-repeat;
}

.editor-content .ProseMirror .selectedCell:after {
  background: color-mix(in srgb, var(--text-muted) 12%, transparent);
}

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
