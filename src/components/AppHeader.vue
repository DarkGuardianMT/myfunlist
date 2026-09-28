<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const router = useRouter()
const { currentUser, isAuthLoading, logout } = useAuth()
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
      <RouterLink class="brand" to="/">MyFunList</RouterLink>

      <nav class="site-nav" aria-label="Main navigation">
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/discover">Discover</RouterLink>
        <RouterLink to="/library">Library</RouterLink>
        <RouterLink to="/lists">Lists</RouterLink>
        <RouterLink to="/profile">Profile</RouterLink>
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
</template>
