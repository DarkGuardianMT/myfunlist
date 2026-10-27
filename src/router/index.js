import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import DiscoverView from '../views/DiscoverView.vue'
import LibraryView from '../views/LibraryView.vue'
import ProfileView from '../views/ProfileView.vue'
import ListsView from '../views/ListsView.vue'
import ListDetailView from '../views/ListDetailView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import MediaDetailView from '../views/MediaDetailView.vue'
import { browsingScrollBehavior, rememberBrowsingPosition } from './browsingContext.js'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: browsingScrollBehavior,
  routes: [
    { path: '/', component: HomeView },
    { path: '/discover', component: DiscoverView },
    { path: '/media/:mediaType/:source/:sourceId', name: 'media-detail', component: MediaDetailView },
    { path: '/library', component: LibraryView },
    { path: '/lists', component: ListsView },
    { path: '/lists/:id', component: ListDetailView },
    { path: '/profile', component: ProfileView },
    { path: '/login', component: LoginView },
    { path: '/register', component: RegisterView },
  ],
})

router.beforeEach((_to, from) => {
  rememberBrowsingPosition(from, { left: window.scrollX, top: window.scrollY })
})

export default router
