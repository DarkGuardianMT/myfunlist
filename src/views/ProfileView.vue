<script setup>
import { computed, ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth.js'

const { currentUser, isAuthLoading, updateDisplayName, changePassword } = useAuth()
const displayName = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const isSavingName = ref(false)
const isSavingPassword = ref(false)
const nameError = ref('')
const nameSuccess = ref('')
const passwordError = ref('')
const passwordSuccess = ref('')

watch(() => currentUser.value?.id, () => {
  displayName.value = currentUser.value?.displayName ?? ''
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  nameError.value = ''
  nameSuccess.value = ''
  passwordError.value = ''
  passwordSuccess.value = ''
}, { immediate: true })

const memberSince = computed(() => {
  const date = new Date(currentUser.value?.createdAt ?? '')
  return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(date)
})

async function saveDisplayName() {
  isSavingName.value = true
  nameError.value = ''
  nameSuccess.value = ''
  const accountId = currentUser.value?.id
  try {
    const user = await updateDisplayName(displayName.value === '' ? null : displayName.value)
    if (currentUser.value?.id !== accountId) return
    displayName.value = user.displayName ?? ''
    nameSuccess.value = 'Display name saved.'
  } catch (error) {
    if (currentUser.value?.id === accountId) nameError.value = error.fields?.displayName || error.message
  } finally {
    isSavingName.value = false
  }
}

async function savePassword() {
  passwordError.value = ''
  passwordSuccess.value = ''
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'New passwords do not match.'
    return
  }
  isSavingPassword.value = true
  const accountId = currentUser.value?.id
  try {
    await changePassword(currentPassword.value, newPassword.value)
    if (currentUser.value?.id !== accountId) return
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordSuccess.value = 'Password changed.'
  } catch (error) {
    if (currentUser.value?.id === accountId) {
      passwordError.value = error.fields?.currentPassword || error.fields?.newPassword || error.message
    }
  } finally {
    isSavingPassword.value = false
  }
}
</script>

<template>
  <section class="profile-page" aria-labelledby="page-title">
    <h1 id="page-title">Profile</h1>
    <p v-if="isAuthLoading" role="status">Checking your session…</p>
    <div v-else-if="!currentUser" class="library-empty">
      <p><RouterLink to="/login">Login</RouterLink> or <RouterLink to="/register">register</RouterLink> to view your account.</p>
    </div>
    <template v-else>
      <section class="profile-card" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <dl class="profile-details">
          <div><dt>Display name</dt><dd>{{ currentUser.displayName || 'Not set' }}</dd></div>
          <div><dt>Email</dt><dd>{{ currentUser.email }}</dd></div>
          <div><dt>Member since</dt><dd>{{ memberSince }}</dd></div>
        </dl>
        <p class="form-hint">Your email is your account identity and cannot be changed here.</p>
      </section>

      <section class="profile-card" aria-labelledby="name-heading">
        <h2 id="name-heading">Display name</h2>
        <p class="profile-description">Choose a name to show in your account. It is optional and does not need to be unique.</p>
        <form @submit.prevent="saveDisplayName">
          <label for="profile-display-name">Display name</label>
          <input id="profile-display-name" v-model="displayName" type="text" autocomplete="nickname" :disabled="isSavingName" />
          <p class="form-hint">Up to 80 characters. Leave blank to remove your display name.</p>
          <p v-if="nameError" role="alert" class="profile-error">{{ nameError }}</p>
          <p v-if="nameSuccess" role="status" class="profile-success">{{ nameSuccess }}</p>
          <button type="submit" :disabled="isSavingName">{{ isSavingName ? 'Saving…' : 'Save display name' }}</button>
        </form>
      </section>

      <section class="profile-card" aria-labelledby="password-heading">
        <h2 id="password-heading">Change password</h2>
        <form @submit.prevent="savePassword">
          <label for="profile-current-password">Current password</label>
          <input id="profile-current-password" v-model="currentPassword" type="password" autocomplete="current-password" required :disabled="isSavingPassword" />
          <label for="profile-new-password">New password</label>
          <input id="profile-new-password" v-model="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required :disabled="isSavingPassword" />
          <label for="profile-confirm-password">Confirm new password</label>
          <input id="profile-confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required :disabled="isSavingPassword" />
          <p class="form-hint">Use 12 to 128 characters.</p>
          <p v-if="passwordError" role="alert" class="profile-error">{{ passwordError }}</p>
          <p v-if="passwordSuccess" role="status" class="profile-success">{{ passwordSuccess }}</p>
          <button type="submit" :disabled="isSavingPassword">{{ isSavingPassword ? 'Changing…' : 'Change password' }}</button>
        </form>
      </section>
    </template>
  </section>
</template>
