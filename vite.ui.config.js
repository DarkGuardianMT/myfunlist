import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  // Deze testserver leest geen privé-envbestanden en heeft geen backendproxy.
  envDir: false,
  envPrefix: 'MYFUNLIST_UI_TEST_',
  define: {
    'import.meta.env.VITE_GOOGLE_BOOKS_API_KEY': JSON.stringify(''),
    'import.meta.env.VITE_OPEN_LIBRARY_DISCOVER_ENABLED': JSON.stringify('false'),
    'import.meta.env.VITE_TIER_LISTS_ENABLED': JSON.stringify(process.env.MYFUNLIST_UI_TEST_TIER_LISTS === 'true' ? 'true' : 'false'),
  },
  cacheDir: 'node_modules/.vite-ui',
  server: { host: '127.0.0.1', port: 4179, strictPort: true, open: false, hmr: false, proxy: {} },
})
