<template>
  <!-- Admin area has its own minimal layout, no blog header -->
  <div
    style="min-height: 100vh; background-color: var(--bg); color: var(--text-main);"
  >
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>
