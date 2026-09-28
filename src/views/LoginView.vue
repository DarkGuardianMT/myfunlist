<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const router = useRouter()
const { login, currentUser, isAuthLoading } = useAuth()
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function submit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    await login(email.value, password.value)
    await router.push('/library')
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <section class="auth-page" aria-labelledby="page-title">
    <h1 id="page-title">Login</h1>
    <p v-if="isAuthLoading" role="status">Checking your session…</p>
    <template v-else-if="currentUser">
      <p>You are logged in as {{ currentUser.email }}.</p>
      <RouterLink class="inline-link" to="/library">View Library</RouterLink>
    </template>
    <form v-else @submit.prevent="submit">
      <label for="login-email">Email</label>
      <input id="login-email" v-model="email" type="email" autocomplete="email" required />
      <label for="login-password">Password</label>
      <input id="login-password" v-model="password" type="password" autocomplete="current-password" required />
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <button type="submit" :disabled="isSubmitting">{{ isSubmitting ? 'Logging in…' : 'Login' }}</button>
    </form>
    <p v-if="!currentUser && !isAuthLoading">New here? <RouterLink to="/register">Register</RouterLink></p>
  </section>
</template>
