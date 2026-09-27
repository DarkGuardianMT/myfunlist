<script setup>
import { useAuth } from '../composables/useAuth.js'

const { currentUser, isAuthLoading } = useAuth()
</script>

<template>
  <section class="page-intro" aria-labelledby="page-title">
    <h1 id="page-title">Profile</h1>
    <p v-if="isAuthLoading">Checking your session…</p>
    <p v-else-if="currentUser">Signed in as {{ currentUser.email }}. Your profile will take shape here.</p>
    <p v-else>
      <RouterLink to="/login">Login</RouterLink> or
      <RouterLink to="/register">register</RouterLink> to view your account.
    </p>
  </section>
</template>
