<script setup>
import { computed } from 'vue'
import { MEDIA_CATEGORIES } from '../domain/mediaPresentation.js'
import MediaTypeIcon from './MediaTypeIcon.vue'

const props = defineProps({
  modelValue: { type: String, required: true },
  label: { type: String, required: true },
  includeAll: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const choices = computed(() => props.includeAll ? [{ id: 'all', label: 'All' }, ...MEDIA_CATEGORIES] : MEDIA_CATEGORIES)

function navigate(event) {
  const buttons = [...event.currentTarget.querySelectorAll('button')]
  const index = buttons.indexOf(event.target)
  if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next].focus()
  emit('update:modelValue', choices.value[next].id)
}
</script>

<template>
  <div class="discover-type-switcher media-type-selector" :class="{ 'media-type-selector--all': includeAll }" role="group" :aria-label="label" @keydown="navigate">
    <button v-for="choice in choices" :key="choice.id" type="button" :value="choice.id"
      class="discover-type-switcher__button" :class="{ 'discover-type-switcher__button--active': modelValue === choice.id }"
      :aria-pressed="modelValue === choice.id" @click="emit('update:modelValue', choice.id)">
      <MediaTypeIcon v-if="choice.id !== 'all'" :type="choice.id" /><span>{{ choice.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.media-type-selector { min-width: 0; }
.media-type-selector--all { margin-bottom: 1rem; }
@media (max-width: 640px) { .media-type-selector--all { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
@media (max-width: 360px) { .media-type-selector--all { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
