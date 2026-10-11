<template>
  <section class="not-found" aria-labelledby="not-found-title">
    <SlotMachine class="not-found-art" />
    <h1 id="not-found-title" class="not-found-title">{{ title }}</h1>
    <p class="not-found-msg">{{ message }}</p>
    <RouterLink to="/" class="not-found-link">{{ linkLabel }}</RouterLink>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import SlotMachine from './SlotMachine.vue'

withDefaults(defineProps<{
  title?: string
  message?: string
  linkLabel?: string
}>(), {
  title: 'Page not found',
  message: 'The page you are looking for does not exist or has moved.',
  linkLabel: 'Back to writing',
})
</script>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: clamp(2rem, 6vh, 4rem) 0 clamp(3rem, 8vh, 5rem);
}

.not-found-art {
  width: clamp(11rem, 40vw, 15rem);
  height: auto;
  aspect-ratio: 280 / 356;
  margin-bottom: clamp(1.5rem, 4vh, 2.5rem);
}

.not-found-title {
  font-family: var(--font-sans);
  font-size: clamp(1.75rem, 4vw, 2.25rem);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--text-main);
  margin: 0 0 0.75rem;
}

.not-found-msg {
  max-width: 32ch;
  font-size: 1rem;
  font-style: italic;
  color: var(--text-muted);
  margin: 0 0 2rem;
}

/* The reference's filled pill, restated in the site's grammar: a hairline
   outline in sans, warming to terracotta on hover rather than glowing. */
.not-found-link {
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-main);
  text-decoration: none;
  padding: 0.6rem 1.4rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  transition: color 0.2s ease, border-color 0.2s ease;
}

.not-found-link:hover {
  color: var(--accent-ink);
  border-color: var(--accent);
}

.not-found-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .not-found-link { transition: none; }
}
</style>
