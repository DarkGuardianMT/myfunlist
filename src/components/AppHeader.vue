<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { useTheme } from '../composables/useTheme.js'

const router = useRouter()
const route = useRoute()
const { currentUser, isAuthLoading, logout } = useAuth()
const { theme, toggleTheme } = useTheme()
const listsActive = computed(() => route.path === '/lists' || route.path.startsWith('/lists/'))
const logoutError = ref('')
const isLoggingOut = ref(false)

watch(currentUser, () => { logoutError.value = '' })

async function handleLogout() {
  isLoggingOut.value = true
  logoutError.value = ''
  try {
    await logout()
    await router.push('/')
  } catch (error) {
    logoutError.value = error.message
  } finally {
    isLoggingOut.value = false
  }
}
</script>

<template>
  <header class="site-header">
    <div class="header-inner">
      <RouterLink class="brand" to="/">My<span>Fun</span>List</RouterLink>

      <button type="button" class="theme-toggle mobile-theme-toggle"
        :aria-label="`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`"
        :aria-pressed="theme === 'dark'" @click="toggleTheme">
        Theme: {{ theme === 'light' ? 'Light' : 'Dark' }}
      </button>

      <nav class="site-nav" aria-label="Main navigation">
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/discover">Discover</RouterLink>
        <RouterLink to="/library">Library</RouterLink>
        <RouterLink to="/lists">Lists</RouterLink>
        <RouterLink to="/profile">Profile</RouterLink>
        <button type="button" class="theme-toggle" :aria-label="`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`"
          :aria-pressed="theme === 'dark'" @click="toggleTheme">
          Theme: {{ theme === 'light' ? 'Light' : 'Dark' }}
        </button>
        <template v-if="!isAuthLoading">
          <template v-if="currentUser">
            <span class="account-email">{{ currentUser.displayName || currentUser.email }}</span>
            <button type="button" class="text-button" :disabled="isLoggingOut" @click="handleLogout">
              {{ isLoggingOut ? 'Logging out…' : 'Logout' }}
            </button>
          </template>
          <template v-else>
            <RouterLink to="/login">Login</RouterLink>
            <RouterLink to="/register">Register</RouterLink>
          </template>
        </template>
      </nav>
    </div>
    <p v-if="logoutError" class="header-error" role="alert">{{ logoutError }}</p>
  </header>

  <nav class="mobile-nav" aria-label="Mobile navigation">
    <RouterLink to="/">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>
      <span>Home</span>
    </RouterLink>
    <RouterLink to="/discover">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
      <span>Discover</span>
    </RouterLink>
    <RouterLink to="/library">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h5v17H3zM9.5 4h5v17h-5zM17 6l4 1-2 14-4-1z" /></svg>
      <span>Library</span>
    </RouterLink>
    <RouterLink to="/lists" :class="{ 'mobile-nav-active': listsActive }"
      :aria-current="listsActive ? 'page' : undefined">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h1M3 12h1M3 18h1" /></svg>
      <span>Lists</span>
    </RouterLink>
    <RouterLink :to="currentUser ? '/profile' : '/login'">
      <svg v-if="currentUser" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3h8v18h-8M3 12h13m-5-5 5 5-5 5" /></svg>
      <span>{{ currentUser ? 'Profile' : 'Login' }}</span>
    </RouterLink>
  </nav>
</template>
