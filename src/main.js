import { createApp } from 'vue'
import './style.css'
import './styles/bookDiscovery.css'
import './styles/cinematic.css'
import './styles/collections.css'
import './styles/account.css'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')
