<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="dialog"
        class="dialog-overlay"
        @click.self="onCancel"
      >
        <div
          ref="panel"
          class="dialog"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="dialog.title ? titleId : undefined"
          :aria-describedby="messageId"
        >
          <h2 v-if="dialog.title" :id="titleId" class="dialog-title">{{ dialog.title }}</h2>
          <p :id="messageId" class="dialog-message">{{ dialog.message }}</p>

          <div class="dialog-actions">
            <button
              v-if="dialog.variant === 'confirm'"
              type="button"
              class="dialog-btn dialog-btn--cancel"
              @click="onCancel"
            >
              {{ dialog.cancelText || 'Cancel' }}
            </button>
            <button
              ref="confirmBtn"
              type="button"
              class="dialog-btn dialog-btn--confirm"
              :class="{ 'dialog-btn--danger': dialog.tone === 'danger' }"
              @click="onConfirm"
            >
              {{ dialog.confirmText || (dialog.variant === 'confirm' ? 'Confirm' : 'OK') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted, useId } from 'vue'
import { dialogState, settleDialog } from './dialog'

const dialog = computed(() => dialogState.active)

const uid = useId()
const titleId = `dialog-title-${uid}`
const messageId = `dialog-message-${uid}`

const panel = ref<HTMLElement | null>(null)
const confirmBtn = ref<HTMLButtonElement | null>(null)
// Element focused before the dialog opened, so we can hand focus back on close.
let lastFocused: HTMLElement | null = null

function onConfirm(): void {
  settleDialog(true)
}

function onCancel(): void {
  settleDialog(false)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    onCancel()
  } else if (event.key === 'Tab') {
    trapFocus(event)
  }
  // Enter/Space activate the focused button natively — no global handling needed.
}

// Keep keyboard focus inside the dialog while it is open.
function trapFocus(event: KeyboardEvent): void {
  const root = panel.value
  if (!root) return
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  // getClientRects (not offsetParent) so position:fixed overlays aren't dropped.
  ).filter((el) => el.getClientRects().length > 0)
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(dialog, async (val, prev) => {
  if (val && !prev) {
    lastFocused = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    // Document-level so Escape/Tab are caught even if focus lands on <body>.
    document.addEventListener('keydown', onKeydown)
    await nextTick()
    confirmBtn.value?.focus()
  } else if (!val && prev) {
    document.body.style.overflow = ''
    document.removeEventListener('keydown', onKeydown)
    lastFocused?.focus?.()
    lastFocused = null
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(20, 20, 18, 0.45);
  backdrop-filter: blur(2px);
}

.dialog {
  width: 100%;
  max-width: 26rem;
  padding: 1.75rem;
  background: var(--bg);
  color: var(--text-main);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
  font-family: var(--font-sans);
}

.dialog-title {
  margin: 0 0 0.6rem;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.3;
}

.dialog-message {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.75rem;
}

.dialog-btn {
  font-family: inherit;
  font-size: 0.875rem;
  padding: 0.45rem 1.2rem;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s, background-color 0.2s;
}

.dialog-btn--cancel {
  background: none;
  border-color: var(--border);
  color: var(--text-main);
}
.dialog-btn--cancel:hover {
  background: var(--bg-subtle);
}

.dialog-btn--confirm {
  background: var(--text-main);
  color: var(--bg);
}
.dialog-btn--confirm:hover {
  opacity: 0.8;
}

/* Destructive actions: accent hue works against --bg text in both themes. */
.dialog-btn--danger {
  background: var(--accent-ink);
  color: var(--bg);
}
.dialog-btn--danger:hover {
  opacity: 0.85;
}

/* Fade the overlay, lift the panel. */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-active .dialog,
.dialog-leave-active .dialog {
  transition: transform 0.2s ease;
}
.dialog-enter-from .dialog,
.dialog-leave-to .dialog {
  transform: translateY(8px) scale(0.98);
}
</style>
