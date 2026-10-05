import { readonly, ref } from 'vue'
import { currentUser } from './authState.js'
import { useLibrary } from './useLibrary.js'
import {
  importLegacyItems, isImportCompleted, legacyCandidate, markImportCompleted,
  importFingerprint,
} from '../services/legacyImport.js'

const offerVisible = ref(false)
const isImporting = ref(false)
const importSummary = ref(null)
const importError = ref('')
let candidate = []
const dismissed = new Set()
let importVersion = 0

export function resetImportPrompt() {
  importVersion++
  offerVisible.value = false
  isImporting.value = false
  importSummary.value = null
  importError.value = ''
  candidate = []
}

export function checkLegacyImport() {
  resetImportPrompt()
  if (!currentUser.value) return
  candidate = legacyCandidate()
  const key = `${currentUser.value.id}:${importFingerprint(candidate)}`
  offerVisible.value = candidate.length > 0
    && !isImportCompleted(currentUser.value.id, candidate)
    && !dismissed.has(key)
}

export function useLegacyImport() {
  const { loadLibrary } = useLibrary()

  function dismissImport() {
    if (currentUser.value) dismissed.add(`${currentUser.value.id}:${importFingerprint(candidate)}`)
    offerVisible.value = false
    importSummary.value = null
    importError.value = ''
  }

  async function startImport() {
    if (!currentUser.value || !candidate.length || isImporting.value) return
    const userId = currentUser.value.id
    const version = importVersion
    isImporting.value = true
    importError.value = ''
    let result
    try {
      result = await importLegacyItems(candidate)
    } catch {
      if (version === importVersion) {
        importError.value = 'Import could not start. Your browser copy is safe.'
        isImporting.value = false
      }
      return
    }
    if (version !== importVersion || currentUser.value?.id !== userId) return
    importSummary.value = result.summary
    if (result.error) importError.value = result.error.code === 'rate_limited'
      ? 'Too many import requests. Your browser copy is safe; try again later.'
      : 'Import paused. Your browser copy is safe; try again later.'
    else if (result.summary.failed) importError.value = 'Some items could not be imported. Your browser copy is safe.'
    else {
      try { markImportCompleted(userId, candidate) } catch { /* Opslag kan uitgeschakeld zijn. */ }
      offerVisible.value = false
    }
    try { await loadLibrary(true) } catch {
      if (version === importVersion) importError.value += ' Your account Library could not be refreshed.'
    }
    if (version === importVersion) isImporting.value = false
  }

  return {
    offerVisible: readonly(offerVisible), isImporting: readonly(isImporting),
    importSummary: readonly(importSummary), importError: readonly(importError),
    dismissImport, startImport,
  }
}
