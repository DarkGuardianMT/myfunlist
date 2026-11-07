<script setup>
import MediaTypeIcon from './MediaTypeIcon.vue'
defineProps({ title: { type: String, required: true }, intro: { type: String, required: true } })
</script>

<template>
  <div class="auth-layout">
    <aside class="auth-story" aria-label="A home for your favourites">
      <p class="cinematic-eyebrow">Your corner of culture</p>
      <p class="auth-story__title">Every story.<br /> One <em>home.</em></p>
      <p>Keep the books, films, shows and games that matter to you. Collected by you, enjoyed at your pace.</p>
      <div class="auth-story__icons" aria-hidden="true"><MediaTypeIcon v-for="type in ['book', 'movie', 'tv', 'game']" :key="type" :type="type" /></div>
      <span class="auth-story__caption">Save it. Rate it. Make it yours.</span>
    </aside>
    <section class="auth-page" aria-labelledby="page-title">
      <p class="cinematic-eyebrow">Make yourself at home</p>
      <h1 id="page-title">{{ title }}</h1>
      <p class="auth-intro">{{ intro }}</p>
      <slot />
    </section>
  </div>
</template>

<style scoped>
.auth-layout { display: grid; grid-template-columns: 1fr 1fr; max-width: 1080px; margin: 1rem auto; border: 1px solid var(--color-border); border-radius: var(--radius-card); overflow: hidden; background: var(--color-surface); }
.auth-story { position: relative; padding: clamp(2rem, 4vw, 4rem); display: flex; flex-direction: column; justify-content: center; background: radial-gradient(ellipse at 30% 80%, var(--color-primary-soft), transparent 75%), var(--color-surface-soft); }
.auth-story__title { margin: 1.25rem 0; font: 750 clamp(2.75rem, 5vw, 4.5rem)/1.02 var(--font-display); letter-spacing: -0.065em; }
.auth-story__title em { color: var(--color-primary-ink); font-style: normal; }
.auth-story > p:not([class]) { color: var(--color-text-muted); font-size: 1rem; line-height: 1.8; }
.auth-story__icons { display: flex; gap: 1.5rem; margin-top: 2rem; color: var(--color-primary-ink); }
.auth-story__icons .media-type-icon { width: 28px; height: 28px; }
.auth-story__caption { margin-top: 3rem; font-size: 0.8125rem; color: var(--color-text-muted); }
.auth-layout .auth-page { width: 100%; min-width: 0; max-width: none; padding: clamp(1.5rem, 4vw, 3.5rem); }
.auth-page h1 { font: 750 2.5rem/1.1 var(--font-display); letter-spacing: -0.05em; margin: 0.75rem 0; }
.auth-intro { margin: 0; color: var(--color-text-muted); font-size: 0.9375rem; line-height: 1.7; }
@media (max-width: 640px) {
  .auth-layout { grid-template-columns: minmax(0, 1fr); margin: 0; }
  .auth-story { padding: 1.5rem; }
  .auth-story__title { font-size: 2.5rem; margin-block: 0.5rem; }
  .auth-story > p:not([class]), .auth-story__icons, .auth-story__caption { display: none; }
  .auth-story__title br { display: none; }
  .auth-layout .auth-page { padding: 1.5rem; }
  .auth-page h1 { font-size: 2rem; }
}
</style>
