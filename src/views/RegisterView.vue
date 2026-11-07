<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import AuthShell from '../components/AuthShell.vue'

const router = useRouter()
const { register, currentUser, isAuthLoading } = useAuth()
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function submit() {
  if (isSubmitting.value) return
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
  <AuthShell title="Register" intro="A Library for everything you love. Start your own collection.">
    <p v-if="isAuthLoading" role="status">Checking your session…</p>
    <template v-else-if="currentUser">
      <p>You are logged in as {{ currentUser.email }}.</p>
      <RouterLink class="inline-link" to="/library">View Library</RouterLink>
    </template>
    <form v-else @submit.prevent="submit">
      <label for="register-email">Email</label>
      <input id="register-email" v-model="email" type="email" autocomplete="email" required :disabled="isSubmitting" :aria-invalid="Boolean(errorMessage)" :aria-describedby="errorMessage ? 'register-error' : undefined" />
      <label for="register-password">Password</label>
      <input id="register-password" v-model="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required :disabled="isSubmitting" :aria-invalid="Boolean(errorMessage)" :aria-describedby="errorMessage ? 'register-password-hint register-error' : 'register-password-hint'" />
      <p id="register-password-hint" class="form-hint">Use 12 to 128 characters.</p>
      <p v-if="errorMessage" id="register-error" role="alert">{{ errorMessage }}</p>
      <button type="submit" :disabled="isSubmitting">{{ isSubmitting ? 'Creating account…' : 'Register' }}</button>
    </form>
    <p v-if="!currentUser && !isAuthLoading">Have an account? <RouterLink to="/login">Login</RouterLink></p>
  </AuthShell>
</template>
