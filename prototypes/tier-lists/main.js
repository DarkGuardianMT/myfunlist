import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import '../../src/style.css'
import '../../src/styles/cinematic.css'
import './tier-lists.css'
import PreviewApp from './PreviewApp.vue'

if (import.meta.env.DEV) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/tier-lists' },
      { path: '/tier-lists', name: 'overview' },
      { path: '/tier-lists/new', name: 'create' },
      { path: '/tier-lists/:id', name: 'editor' },
      { path: '/:section(home|discover|library|lists|profile|login)', name: 'section' },
    ].map(route => ({ component: { render: () => null }, ...route })),
    scrollBehavior: () => ({ top: 0 }),
  })
  const app = createApp(PreviewApp)
  app.use(router)
  router.isReady().then(() => app.mount('#app'))
}
