import { computed, readonly } from 'vue'
import { authError, currentUser, isAuthLoading } from './authState.js'
import {
  advanceAuthEpoch, clearCsrfToken, refreshCsrfToken, request,
  setSessionExpiredHandler,
} from '../services/apiClient.js'
import { resetLibrary, useLibrary } from './useLibrary.js'
import { resetLists } from './useLists.js'
import { checkLegacyImport, resetImportPrompt } from './useLegacyImport.js'

const { loadLibrary } = useLibrary()
let bootstrapPromise = null
let accountVersion = 0

function setAccount(user) {
  accountVersion++
  advanceAuthEpoch()
  currentUser.value = user
  resetLibrary()
  resetLists()
  resetImportPrompt()
}

setSessionExpiredHandler(() => {
  if (currentUser.value) {
    setAccount(null)
    clearCsrfToken()
    authError.value = 'Your session ended. Please log in again.'
  }
})

async function finishAuthentication(user) {
  setAccount(user)
  try { await refreshCsrfToken() } catch { clearCsrfToken() }
  try { await loadLibrary() } catch { /* Het bibliotheekscherm toont de laadfout. */ }
  if (currentUser.value?.id !== user.id) {
    throw new Error('Your session ended. Please log in again.')
  }
  checkLegacyImport()
}

export function useAuth() {
  async function refreshCurrentUser() {
    const version = accountVersion
    try {
      const data = await request('/api/v1/auth/me', { handleUnauthorized: false })
      if (version !== accountVersion) return
      await finishAuthentication(data.user)
      authError.value = ''
    } catch (error) {
      if (version !== accountVersion) return
      setAccount(null)
      if (error.status === 401) authError.value = ''
      else authError.value = error.message
    } finally {
      isAuthLoading.value = false
    }
  }

  function bootstrapAuth() {
    if (!bootstrapPromise) bootstrapPromise = refreshCurrentUser()
    return bootstrapPromise
  }

  async function authenticate(path, email, password) {
    authError.value = ''
    try {
      const data = await request(path, {
        method: 'POST', body: { email, password }, handleUnauthorized: false,
      })
      await finishAuthentication(data.user)
      isAuthLoading.value = false
      return data.user
    } catch (error) {
      authError.value = error.message
      throw error
    }
  }

  async function logout() {
    await request('/api/v1/auth/logout', { method: 'POST' })
    setAccount(null)
    clearCsrfToken()
    authError.value = ''
  }

  async function updateDisplayName(displayName) {
    const accountId = currentUser.value?.id
    const version = accountVersion
    const data = await request('/api/v1/profile', { method: 'PATCH', body: { displayName } })
    if (accountVersion === version && currentUser.value?.id === accountId) currentUser.value = data.user
    return data.user
  }

  async function changePassword(currentPassword, newPassword) {
    const version = accountVersion
    await request('/api/v1/account/password', {
      method: 'POST', body: { currentPassword, newPassword },
    })
    if (accountVersion !== version) return
    clearCsrfToken()
    try { await refreshCsrfToken() } catch { clearCsrfToken() }
  }

  return {
    currentUser: readonly(currentUser), isAuthenticated: computed(() => Boolean(currentUser.value)),
    isAuthLoading: readonly(isAuthLoading), authError: readonly(authError),
    bootstrapAuth, refreshCurrentUser,
    login: (email, password) => authenticate('/api/v1/auth/login', email, password),
    register: (email, password) => authenticate('/api/v1/auth/register', email, password),
    logout,
    updateDisplayName, changePassword,
  }
}
