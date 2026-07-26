<template>
  <!-- Idle with no icon slot renders nothing, so text buttons keep their exact
       resting width until an action actually starts. -->
  <span
    v-if="phase !== 'idle' || hasIcon"
    class="action-mark"
    :class="`action-mark--${phase}`"
    aria-hidden="true"
  >
    <svg
      v-if="phase === 'done'"
      class="action-check"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
    >
      <path
        d="M2 6.3 4.6 8.9 10 3.1"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <slot v-else-if="phase === 'idle'" />
  </span>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'
import type { ActionPhase } from '../shared/action-state'

defineProps<{ phase: ActionPhase }>()

const slots = useSlots()
const hasIcon = computed(() => !!slots.default)
</script>

<style scoped>
.action-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

/* A hairline arc, not a filled spinner — same restraint as the rest of the UI. */
.action-mark--doing {
  width: 0.78em;
  height: 0.78em;
  border: 1px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  opacity: 0.65;
  animation: action-spin 0.65s linear infinite;
}

.action-mark--done {
  animation: action-settle 0.22s ease-out;
}

.action-check {
  width: 0.85em;
  height: 0.85em;
}

@keyframes action-spin {
  to {
    transform: rotate(1turn);
  }
}

@keyframes action-settle {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* The global reduce-motion rule collapses durations; leave the arc as a static
   mark rather than a stalled fragment of a spin. */
@media (prefers-reduced-motion: reduce) {
  .action-mark--doing {
    animation: none;
  }
}
</style>
