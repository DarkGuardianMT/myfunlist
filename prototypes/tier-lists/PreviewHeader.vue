<script setup>
import { onMounted, onUnmounted, watch, ref } from 'vue'
import { useRoute } from 'vue-router'

defineProps({ theme: String })
const emit = defineEmits(['theme'])
const route = useRoute()
const account = ref(null)
const links = [
  { label: 'Home', to: '/home', icon: 'm3 10 9-7 9 7v10H15v-6H9v6H3z' },
  { label: 'Discover', to: '/discover', icon: 'M17 10a7 7 0 1 1-14 0 7 7 0 1 1 14 0Zm-2 5 6 6' },
  { label: 'Library', to: '/library', icon: 'M3 4h5v17H3zM9.5 4h5v17h-5zM17 6l4 1-2 14-4-1z' },
  { label: 'Lists', to: '/lists', icon: 'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1' },
  { label: 'Tier Lists', to: '/tier-lists', icon: 'M3 5h18v4H3zM3 10h13v4H3zM3 15h9v4H3z' },
]

watch(() => route.fullPath, () => { if (account.value) account.value.open = false })

function closeAccount(restoreFocus = false) {
  account.value.open = false
  if (restoreFocus) account.value.querySelector('summary').focus()
}

function closeOutside(event) {
  if (account.value?.open && !account.value.contains(event.target)) closeAccount()
}

onMounted(() => document.addEventListener('click', closeOutside))
onUnmounted(() => document.removeEventListener('click', closeOutside))
</script>

<template>
  <header class="site-header tier-shell">
    <div class="header-inner">
      <RouterLink class="brand" to="/home" aria-label="MyFunList home">
        <span class="brand-mark" aria-hidden="true"><i /><i /><i /></span>MyFunList<span class="brand-dot" aria-hidden="true">.</span>
      </RouterLink>
      <nav class="site-nav" aria-label="Main navigation">
        <RouterLink v-for="link in links" :key="link.to" :to="link.to"
          :class="{ 'nav-section-active': link.to === '/tier-lists' && route.path.startsWith('/tier-lists') }"
          :aria-current="link.to === '/tier-lists' && route.path.startsWith('/tier-lists') ? 'page' : undefined">
          {{ link.label }}
        </RouterLink>
        <RouterLink to="/profile">Profile</RouterLink>
      </nav>
      <div class="tier-shell-actions">
        <button class="theme-toggle" type="button" :aria-label="`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`"
          @click="emit('theme')">{{ theme === 'light' ? 'Light' : 'Dark' }}</button>
        <details ref="account" class="account-menu" @keydown.esc.stop="closeAccount(true)"
          @focusout="event => { if (event.relatedTarget && !account.contains(event.relatedTarget)) closeAccount() }">
          <summary aria-label="Account menu">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 22v-2a8 8 0 0 1 16 0v2" /></svg>
          </summary>
          <div class="account-menu-panel">
            <RouterLink to="/profile" @click="closeAccount()">Account settings</RouterLink>
            <RouterLink to="/login" @click="closeAccount()">Log in</RouterLink>
          </div>
        </details>
      </div>
    </div>
  </header>
  <nav class="mobile-nav" aria-label="Mobile navigation">
    <RouterLink v-for="link in links" :key="link.to" :to="link.to"
      :class="{ 'mobile-nav-active': link.to === '/tier-lists' && route.path.startsWith('/tier-lists') }"
      :aria-current="link.to === '/tier-lists' && route.path.startsWith('/tier-lists') ? 'page' : undefined">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="link.icon" /></svg><span>{{ link.label }}</span>
    </RouterLink>
  </nav>
</template>
