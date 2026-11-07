<script setup>
import { onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import LegacyImportOffer from './components/LegacyImportOffer.vue'
import LibraryRemovalNotices from './components/LibraryRemovalNotices.vue'
import { useAuth } from './composables/useAuth.js'

const { bootstrapAuth } = useAuth()
onMounted(bootstrapAuth)
</script>

<template>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <AppHeader />
  <main class="page-content" id="main-content" tabindex="-1">
    <LegacyImportOffer />
    <RouterView />
    <LibraryRemovalNotices />
  </main>
</template>
