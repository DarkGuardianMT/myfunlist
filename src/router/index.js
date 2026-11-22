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
import { browsingScrollBehavior, rememberBrowsingPosition, rememberDetailOrigin } from './browsingContext.js'

const tierListSection = { render: () => null }
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
    ...(import.meta.env && import.meta.env.VITE_TIER_LISTS_ENABLED === 'true' ? [{
      path: '/tier-lists', component: () => import('../views/TierListsView.vue'),
      children: [
        { path: '', name: 'tier-lists', component: tierListSection },
        { path: 'new', name: 'tier-lists-create', component: tierListSection },
        { path: ':id', name: 'tier-lists-board', component: tierListSection },
      ],
    }] : []),
    { path: '/profile', component: ProfileView },
    { path: '/login', component: LoginView },
    { path: '/register', component: RegisterView },
  ],
})

router.beforeEach((to, from) => {
  rememberBrowsingPosition(from, { left: window.scrollX, top: window.scrollY })
  rememberDetailOrigin(to, from)
})

export default router
