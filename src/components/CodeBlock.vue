<template>
  <div class="code">
    <pre class="code-pre" ref="preEl"><code>{{ code }}</code></pre>
    <button class="code-copy" type="button" @click="copy">{{ label }}</button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

defineProps<{ code: string }>()

const preEl = ref<HTMLElement | null>(null)
const label = ref('Copy')
let timer: number | undefined

function flash(next: string): void {
  label.value = next
  window.clearTimeout(timer)
  timer = window.setTimeout(() => { label.value = 'Copy' }, 1400)
}

/** Pre-clipboard-API browsers, and any context where the async write is denied. */
function execCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const won = document.execCommand('copy')
    document.body.removeChild(ta)
    return won
  } catch {
    return false
  }
}

/** Last resort: select the block so the reader's own copy shortcut works. */
function offerManual(): void {
  const pre = preEl.value
  if (pre) {
    try {
      const range = document.createRange()
      range.selectNodeContents(pre)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    } catch {
      // Selection unavailable; the label below still tells them what to press.
    }
  }
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  flash(mac ? 'Press ⌘C' : 'Press Ctrl+C')
}

function copy(): void {
  const text = preEl.value?.innerText
  if (!text) return

  const fallback = (): void => { if (execCopy(text)) flash('Copied'); else offerManual() }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => flash('Copied'), fallback)
  } else {
    fallback()
  }
}

onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<style scoped>
.code {
  position: relative;
}

.code-pre {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.6;
  margin: 0;
  /* Right padding clears the copy button so a long line never runs beneath it. */
  padding: 0.95rem 5.4rem 0.95rem 1.05rem;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  overflow-x: auto;
  color: var(--text-main);
}

/* Quiet until wanted: revealed on hover, and by focus so it stays reachable
   from the keyboard, where there is no hover to trigger it. */
.code-copy {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  min-width: 4.3rem;
  font-family: var(--font-sans);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 0.2rem 0.45rem;
  cursor: var(--cursor-pointer, pointer);
  opacity: 0;
  transition: opacity 0.2s ease, color 0.2s ease;
}

.code:hover .code-copy,
.code-copy:focus-visible {
  opacity: 1;
}

.code-copy:hover {
  color: var(--text-main);
}

/* Touch has no hover state to reveal it, so it simply stays visible. */
@media (hover: none) {
  .code-copy {
    opacity: 1;
  }
}
</style>
