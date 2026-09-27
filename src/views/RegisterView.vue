<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const router = useRouter()
const { register, currentUser, isAuthLoading } = useAuth()
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function submit() {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    await register(email.value, password.value)
    await router.push('/library')
  } catch (error) {
    errorMessage.value = error.fields
      ? Object.values(error.fields).join(' ') : error.message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <section class="auth-page" aria-labelledby="page-title">
    <h1 id="page-title">Register</h1>
    <p v-if="isAuthLoading" role="status">Checking your session…</p>
    <template v-else-if="currentUser">
      <p>You are logged in as {{ currentUser.email }}.</p>
      <RouterLink class="inline-link" to="/library">View Library</RouterLink>
    </template>
    <form v-else @submit.prevent="submit">
      <label for="register-email">Email</label>
      <input id="register-email" v-model="email" type="email" autocomplete="email" required />
      <label for="register-password">Password</label>
      <input id="register-password" v-model="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required />
      <p class="form-hint">Use 12 to 128 characters.</p>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <button type="submit" :disabled="isSubmitting">{{ isSubmitting ? 'Creating account…' : 'Register' }}</button>
    </form>
    <p v-if="!currentUser && !isAuthLoading">Have an account? <RouterLink to="/login">Login</RouterLink></p>
  </section>
</template>
