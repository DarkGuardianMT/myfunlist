import { ref } from 'vue'

const key = 'myfunlist_collection_view'
const modes = ['comfortable', 'compact', 'list']
const viewMode = ref('comfortable')
try {
  const saved = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
  if (modes.includes(saved)) viewMode.value = saved
} catch { /* Zonder opslag blijft de standaardweergave bruikbaar. */ }

export function useCollectionView() {
  function selectView(mode) {
    if (!modes.includes(mode)) return
    viewMode.value = mode
    try { window.localStorage.setItem(key, mode) } catch { /* De keuze blijft voor deze sessie actief. */ }
  }
  return { viewMode, selectView }
}
