<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { useLibrary } from '../composables/useLibrary.js'
import { getVisibleLibraryItems } from '../utils/libraryDisplay.js'
import MediaTypeIcon from '../components/MediaTypeIcon.vue'
import HomeShelfCard from '../components/HomeShelfCard.vue'

const router = useRouter()
const { currentUser, isAuthLoading } = useAuth()
const { displayLibraryItems, isLibraryLoading, isLibraryLoaded, libraryError, loadLibrary } = useLibrary()
const query = ref('')
const mediaType = ref('book')
const worlds = [
  { id: 'book', name: 'Books', caption: 'One more chapter.', description: 'Find your next great read.', provider: 'Google Books' },
  { id: 'movie', name: 'Movies', caption: 'Make it a movie night.', description: 'Find a film that stays with you.', provider: 'TMDB' },
  { id: 'tv', name: 'TV Shows', caption: 'Your next obsession.', description: 'Find a series to settle into.', provider: 'TMDB' },
  { id: 'game', name: 'Games', caption: 'Another world awaits.', description: 'Find something worth playing.', provider: 'RAWG' },
]
const recent = computed(() => getVisibleLibraryItems(displayLibraryItems.value, 'all', 'all', 'recent'))
const inProgress = computed(() => recent.value.filter(item => ['reading', 'watching', 'playing'].includes(item.userMedia.status)))
const shelf = computed(() => (inProgress.value.length ? inProgress.value : recent.value).slice(0, 6))

async function loadHomeLibrary(force = false) {
  if (!currentUser.value || isAuthLoading.value) return
  try { await loadLibrary(force) } catch { /* De gedeelde foutstatus biedt een expliciete herkansing. */ }
}
watch([currentUser, isAuthLoading], () => loadHomeLibrary(), { immediate: true })

function search() {
  const q = query.value.trim()
  if (q) router.push({ path: '/discover', query: { ...(mediaType.value !== 'book' ? { type: mediaType.value } : {}), q } })
}
</script>

<template>
  <div class="cinematic-home">
    <section class="home-hero" aria-labelledby="page-title">
      <div class="home-hero-copy">
        <p class="cinematic-eyebrow">Your corner of culture</p>
        <h1 id="page-title">Track what<br />you <em>love.</em></h1>
        <p class="home-hero-description">The stories that stay with you.<br />A home for every book, film, show and game.</p>
        <div class="home-actions">
          <RouterLink class="home-primary-link" to="/discover">Discover media <span aria-hidden="true">↗</span></RouterLink>
          <RouterLink v-if="currentUser" class="inline-link" to="/library">View your Library</RouterLink>
          <RouterLink v-else-if="!isAuthLoading" class="inline-link" to="/register">Create an account</RouterLink>
        </div>
        <p class="home-hero-note">Save it. Rate it. Make it yours.</p>
      </div>
      <form class="home-search" role="search" aria-label="Find media" @submit.prevent="search">
        <div class="home-search-orbit" aria-hidden="true"><MediaTypeIcon :type="mediaType" /></div>
        <p class="cinematic-eyebrow">A little curiosity goes a long way</p>
        <h2>Where will you<br />go next?</h2>
        <div class="home-search-types" role="group" aria-label="Search media type">
          <button v-for="world in worlds" :key="world.id" type="button" :aria-pressed="mediaType === world.id" @click="mediaType = world.id">{{ world.name }}</button>
        </div>
        <label for="home-query">{{ mediaType === 'book' ? 'Title, author, or ISBN' : 'Search by title' }}</label>
        <div class="home-search-controls"><input id="home-query" v-model="query" type="search" maxlength="200" placeholder="Follow your curiosity…" autocomplete="off" /><button type="submit" :disabled="!query.trim()" aria-label="Find media">↗</button></div>
        <p class="home-search-source">Search {{ worlds.find(world => world.id === mediaType).provider }}. Keep your favourites in one place.</p>
      </form>
    </section>

    <section v-if="currentUser" class="home-personal" aria-labelledby="home-shelf-title">
      <div class="cinematic-section-heading"><div><p class="cinematic-eyebrow">Your own good taste</p><h2 id="home-shelf-title">{{ inProgress.length ? 'Pick up where you left off.' : 'Recently saved.' }}</h2></div><RouterLink class="inline-link" to="/library">Your Library <span aria-hidden="true">→</span></RouterLink></div>
      <p v-if="isLibraryLoading || !isLibraryLoaded && !libraryError" class="home-state" role="status">Loading your Library…</p>
      <div v-else-if="libraryError" class="home-state" role="alert"><p>Your Library could not be loaded.</p><button class="catalogue-retry" type="button" @click="loadHomeLibrary(true)">Try again</button></div>
      <div v-else-if="shelf.length" class="home-shelf"><HomeShelfCard v-for="item in shelf" :key="item.userMedia.id" :item="item" /></div>
      <div v-else class="home-state"><h3>Your next favourite belongs here.</h3><p>Find something you love and add it to your Library to start your collection.</p><RouterLink class="inline-link" to="/discover">Find something new →</RouterLink></div>
    </section>

    <section aria-labelledby="home-worlds-title">
      <div class="cinematic-section-heading"><div><p class="cinematic-eyebrow">Four ways to get lost</p><h2 id="home-worlds-title">A world for every mood.</h2></div><span class="home-section-note">One Library. All your favourites.</span></div>
      <div class="home-worlds">
        <RouterLink v-for="(world, index) in worlds" :key="world.id" class="home-world" :data-type="world.id" :to="{ path: '/discover', query: world.id === 'book' ? {} : { type: world.id } }">
          <div class="home-world-art" aria-hidden="true"><span class="home-world-number">0{{ index + 1 }}</span><MediaTypeIcon :type="world.id" /><span class="home-world-arrow">↗</span></div>
          <h3>{{ world.name }}</h3><p class="home-world-caption">{{ world.caption }}</p><p>{{ world.description }}</p>
        </RouterLink>
      </div>
    </section>

    <section class="home-collection-note" aria-labelledby="home-collection-title"><MediaTypeIcon type="book" /><div><p class="cinematic-eyebrow">Collected by you. Enjoyed at your pace.</p><h2 id="home-collection-title">Good stories deserve a place to stay.</h2><p>Track your progress, give a personal rating and bring your favourites together in private lists.</p></div><RouterLink class="home-primary-link" :to="currentUser ? '/lists' : '/register'">{{ currentUser ? 'Your private lists' : 'Make yourself at home' }} <span aria-hidden="true">→</span></RouterLink></section>
  </div>
</template>
