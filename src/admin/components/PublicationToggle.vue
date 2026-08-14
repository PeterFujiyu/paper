<template>
  <label class="publish-toggle">
    <input
      type="checkbox"
      :checked="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span>{{ modelValue ? 'Live' : 'Draft' }}</span>
  </label>
</template>

<script setup lang="ts">
// The publication control for the essay, note and brew editors. Publication
// means the same thing in all three — off the site, or on it — so it reads and
// behaves identically in all three.
defineProps({
  modelValue: { type: Boolean, required: true },
})
const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.publish-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  cursor: var(--cursor-pointer);
}

.publish-toggle input {
  accent-color: var(--text-main);
}
</style>
