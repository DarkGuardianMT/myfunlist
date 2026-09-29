import { readonly, ref } from 'vue'

const STORAGE_KEY = 'myfunlist_theme'
const theme = ref(typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  ? 'dark' : 'light')

function setTheme(value) {
  theme.value = value === 'dark' ? 'dark' : 'light'
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme.value
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, theme.value)
  } catch { /* Opslag kan uitgeschakeld zijn; de huidige pagina blijft bruikbaar. */ }
}

export function useTheme() {
  return {
    theme: readonly(theme),
    toggleTheme: () => setTheme(theme.value === 'light' ? 'dark' : 'light'),
  }
}
