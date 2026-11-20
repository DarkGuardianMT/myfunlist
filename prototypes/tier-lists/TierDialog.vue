<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({ title: { type: String, required: true }, wide: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)

onMounted(() => dialog.value.showModal())
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <dialog ref="dialog" class="tier-dialog" :class="{ 'tier-dialog-wide': wide }"
    aria-labelledby="tier-dialog-title" @cancel.prevent="emit('close')">
    <header class="tier-dialog-header">
      <h2 id="tier-dialog-title">{{ title }}</h2>
      <button type="button" class="tl-button tl-icon-button" aria-label="Close dialog" autofocus @click="emit('close')">×</button>
    </header>
    <div class="tier-dialog-body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="tier-dialog-footer">
      <slot name="footer" />
    </footer>
  </dialog>
</template>
