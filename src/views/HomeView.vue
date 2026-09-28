<script setup>
import { useAuth } from '../composables/useAuth.js'

const { currentUser, isAuthLoading } = useAuth()
</script>

<template>
  <section class="page-intro home-intro" aria-labelledby="page-title">
    <h1 id="page-title">Keep your favorites together</h1>
    <p>Discover books, movies, TV shows, and games. Save what you want to enjoy, track your progress, and add a personal rating.</p>
    <p>Create private lists to organize your Library your way.</p>
    <div class="home-actions">
      <RouterLink class="home-primary-link" to="/discover">Discover media</RouterLink>
      <RouterLink v-if="currentUser" class="inline-link" to="/library">View your Library</RouterLink>
      <template v-else-if="!isAuthLoading">
        <RouterLink class="inline-link" to="/register">Create an account</RouterLink>
        <RouterLink class="inline-link" to="/login">Login</RouterLink>
      </template>
    </div>
  </section>
</template>
