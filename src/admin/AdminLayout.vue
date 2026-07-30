<template>
  <!-- Admin area has its own minimal layout, no blog header. This <main> is the
       skip-link target for every admin child route (only one renders at a time). -->
  <main
    id="main"
    tabindex="-1"
    style="min-height: 100vh; background-color: var(--bg); color: var(--text-main);"
  >
    <!-- Nested swaps (list ↔ editor) animate too. No `appear`: when the admin
         area is first entered, the outer transition in App.vue already runs. -->
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>
