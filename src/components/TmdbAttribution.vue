<script setup>
import tmdbLogo from '../assets/tmdb-logo.svg'
</script>

<template>
  <section class="tmdb-attribution" aria-labelledby="tmdb-credits-title">
    <h2 id="tmdb-credits-title">Data credits</h2>
    <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
      <img :src="tmdbLogo" alt="TMDB" />
    </a>
    <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
  </section>
</template>
