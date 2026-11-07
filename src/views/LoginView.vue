<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import AuthShell from '../components/AuthShell.vue'

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
  <AuthShell title="Login" intro="Welcome back. Your next chapter is right where you left it.">
    <p v-if="isAuthLoading" role="status">Checking your session…</p>
    <template v-else-if="currentUser">
      <p>You are logged in as {{ currentUser.email }}.</p>
      <RouterLink class="inline-link" to="/library">View Library</RouterLink>
    </template>
    <form v-else @submit.prevent="submit">
      <label for="login-email">Email</label>
      <input id="login-email" v-model="email" type="email" autocomplete="email" required :disabled="isSubmitting" :aria-invalid="Boolean(errorMessage)" :aria-describedby="errorMessage ? 'login-error' : undefined" />
      <label for="login-password">Password</label>
      <input id="login-password" v-model="password" type="password" autocomplete="current-password" required :disabled="isSubmitting" :aria-invalid="Boolean(errorMessage)" :aria-describedby="errorMessage ? 'login-error' : undefined" />
      <p v-if="errorMessage" id="login-error" role="alert">{{ errorMessage }}</p>
      <button type="submit" :disabled="isSubmitting">{{ isSubmitting ? 'Logging in…' : 'Login' }}</button>
    </form>
    <p v-if="!currentUser && !isAuthLoading">New here? <RouterLink to="/register">Register</RouterLink></p>
  </AuthShell>
</template>
