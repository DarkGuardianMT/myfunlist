<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

defineProps({ label: { type: String, required: true } })
const disclosure = ref(null)
const panel = ref(null)
const placement = ref({})

function close(restoreFocus = false) {
  if (!disclosure.value?.open) return
  disclosure.value.open = false
  if (restoreFocus) disclosure.value.querySelector('summary').focus({ preventScroll: true })
}

async function position() {
  if (!disclosure.value?.open) return
  await nextTick()
  const anchor = disclosure.value.getBoundingClientRect()
  const content = panel.value.getBoundingClientRect()
  const left = Math.max(16, Math.min(anchor.right - content.width, window.innerWidth - content.width - 16)) - anchor.left
  const safeBottom = window.innerWidth <= 640 ? 90 : 16
  const below = window.innerHeight - anchor.bottom - safeBottom - 8
  const above = anchor.top - 16
  const placeAbove = below < Math.min(content.height, 240) && above > below
  placement.value = { left: `${left}px`, ...(placeAbove ? { bottom: 'calc(100% + 8px)', top: 'auto' } : { top: 'calc(100% + 8px)', bottom: 'auto' }), maxHeight: `${Math.max(120, placeAbove ? above : below)}px` }
}

function outside(event) {
  if (!disclosure.value?.contains(event.target)) close()
}
function viewportChanged() { close() }
onMounted(() => {
  document.addEventListener('pointerdown', outside)
  document.addEventListener('focusin', outside)
  window.addEventListener('resize', viewportChanged)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('focusin', outside)
  window.removeEventListener('resize', viewportChanged)
})
</script>

<template>
  <details ref="disclosure" class="card-popover" @toggle="position" @keydown.esc.stop.prevent="close(true)">
    <summary :aria-label="label"><slot name="trigger" /></summary>
    <div ref="panel" class="card-popover__panel" :style="placement"><slot /></div>
  </details>
</template>

<style scoped>
.card-popover { position: relative; min-width: 0; }
.card-popover summary { display: flex; align-items: center; justify-content: center; gap: 0.4rem; min-width: 44px; min-height: 44px; padding: 0.4rem; list-style: none; color: var(--color-text-muted); font-size: 0.8125rem; cursor: pointer; border-radius: var(--radius-control); }
.card-popover summary::-webkit-details-marker { display: none; }
.card-popover summary:hover, .card-popover[open] summary { color: var(--color-primary-ink); background: var(--color-primary-soft); }
.card-popover summary:focus-visible { outline: 2px solid var(--color-primary-ink); outline-offset: 2px; }
.card-popover__panel { position: absolute; z-index: 40; top: calc(100% + 8px); right: 0; width: min(18rem, calc(100vw - 2rem)); padding: 1rem; border: 1px solid var(--color-control-border); border-radius: var(--radius-card); background: var(--color-surface); box-shadow: 0 12px 40px #0005; overflow: auto; overscroll-behavior: contain; }
.card-popover__panel :deep(select) { width: 100%; min-height: 44px; font-size: 1rem; }
.card-popover__panel :deep(label) { display: block; margin-bottom: 0.5rem; color: var(--color-text-muted); font-size: 0.8125rem; }
</style>
