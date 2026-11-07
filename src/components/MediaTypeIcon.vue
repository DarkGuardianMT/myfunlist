<script setup>
defineProps({ type: { type: String, required: true } })
</script>

<template>
  <svg class="media-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-if="type === 'book'" d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15" />
    <template v-else-if="type === 'movie'"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" /></template>
    <template v-else-if="type === 'tv'"><rect x="3" y="6" width="18" height="14" rx="2" /><path d="m8 2 4 4 4-4M8 23h8" /></template>
    <path v-else d="M7 7h10c3 0 5 10 3 12-2 2-5-3-6-3h-4c-1 0-4 5-6 3C2 17 4 7 7 7Zm1 3v5m-2.5-2.5h5M16 11h.01M18 14h.01" />
  </svg>
</template>
