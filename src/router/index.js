import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import DiscoverView from '../views/DiscoverView.vue'
import LibraryView from '../views/LibraryView.vue'
import ProfileView from '../views/ProfileView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: HomeView },
    { path: '/discover', component: DiscoverView },
    { path: '/library', component: LibraryView },
    { path: '/profile', component: ProfileView },
  ],
})

export default router
