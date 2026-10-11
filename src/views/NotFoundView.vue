<template>
  <main id="main" tabindex="-1">
    <NotFound />
  </main>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import NotFound from '../components/NotFound.vue'

const SITE_TITLE = 'Paper'

onMounted(() => {
  document.title = `Page not found — ${SITE_TITLE}`
})

onBeforeUnmount(() => {
  document.title = SITE_TITLE
})
</script>
