<template>
  <nav class="toc" :class="`toc--${variant}`" aria-label="Table of contents">
    <p v-if="variant === 'rail'" class="toc-title">Contents</p>
    <button
      v-else
      type="button"
      class="toc-toggle"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="listId"
      @click="open = !open"
    >
      <span>Contents</span>
      <svg
        class="toc-chevron"
        :class="{ 'toc-chevron--closed': !open }"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 -960 960 960"
        width="14"
        height="14"
        fill="currentColor"
        aria-hidden="true"
      ><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z" /></svg>
    </button>

    <ol v-show="expanded" :id="listId" class="toc-list">
      <li
        v-for="entry in headings"
        :key="entry.id"
        class="toc-item"
        :class="`toc-item--h${entry.level}`"
      >
        <a
          :href="headingHash(entry.id)"
          class="toc-link"
          :class="{ 'toc-link--current': entry.id === activeId }"
          :aria-current="entry.id === activeId ? 'true' : undefined"
          @click="select($event, entry.id)"
        >{{ entry.text }}</a>
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { headingHash, type HeadingEntry } from '../shared/headings'

const props = withDefaults(defineProps<{
  headings: HeadingEntry[]
  activeId?: string
  /** `rail` is the always-open desktop side rail; `disclosure` is the mobile one. */
  variant?: 'rail' | 'disclosure'
}>(), {
  activeId: '',
  variant: 'rail',
})

const emit = defineEmits<{ select: [id: string] }>()

const listId = useId()
const open = ref(false)

const expanded = computed(() => props.variant === 'rail' || open.value)

// Plain hash links, so a middle- or modifier-click still opens the section in a
// new tab and the status bar shows the real target. Only the ordinary click is
// taken over, to route the jump through the header-aware scroll.
function select(event: MouseEvent, id: string): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

  event.preventDefault()
  open.value = false
  emit('select', id)
}
</script>

<style scoped>
/* Typography and a single hairline do the work — no card, no panel, no shadow. */
.toc-title,
.toc-toggle {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0;
}

.toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-left: 1px solid var(--border);
}

.toc-link {
  display: block;
  font-family: var(--font-sans);
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text-muted);
  text-decoration: none;
  padding: 0.3rem 0 0.3rem 0.9rem;
  /* Sits on top of the list's rule, so the accent replaces it rather than
     stacking a second line beside it. */
  border-left: 1px solid transparent;
  margin-left: -1px;
  transition: color 0.2s ease, border-color 0.2s ease;
}

.toc-item--h3 .toc-link {
  padding-left: 1.7rem;
  font-size: 0.75rem;
}

.toc-link:hover { color: var(--accent-ink); }

.toc-link--current {
  color: var(--text-main);
  border-left-color: var(--accent);
}

/* ─── Desktop side rail ───
   Fixed and measured off the viewport centre so it parks beside the reading
   column without joining it — the 68ch measure is untouched. */
.toc--rail {
  position: fixed;
  z-index: 90;
  top: calc(var(--header-h) + 3.5rem);
  /* max() keeps it on screen if the reading measure ever resolves wider than
     the font it was sized against. */
  left: max(1rem, calc(50vw - var(--measure) / 2 - var(--toc-rail-w) - 2rem));
  width: var(--toc-rail-w);
  max-height: calc(100vh - var(--header-h) - 7rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.toc--rail .toc-title { margin-bottom: 0.9rem; }

/* ─── Mobile disclosure ─── */
.toc--disclosure {
  margin: 0 0 2.5rem 0;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--border);
}

.toc-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: none;
  padding: 0;
  cursor: var(--cursor-pointer);
  transition: color 0.2s ease;
}

.toc-toggle:hover { color: var(--accent-ink); }

.toc-chevron { transition: transform 0.25s var(--ease-out); }
.toc-chevron--closed { transform: rotate(180deg); }

.toc--disclosure .toc-list { margin-top: 1rem; }
</style>
