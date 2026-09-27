<script setup>
import { onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import LegacyImportOffer from './components/LegacyImportOffer.vue'
import { useAuth } from './composables/useAuth.js'

const { bootstrapAuth } = useAuth()
onMounted(bootstrapAuth)
</script>

<template>
  <AppHeader />
  <main class="page-content" id="main-content">
    <LegacyImportOffer />
    <RouterView />
  </main>
</template>
