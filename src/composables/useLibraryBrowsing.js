import { ref, watch } from 'vue'
import { currentUser } from './authState.js'
import { clearBrowsingPositions } from '../router/browsingContext.js'

const mediaTypeFilter = ref('all')
const statusFilter = ref('all')
const sortOrder = ref('recent')

watch(mediaTypeFilter, () => { statusFilter.value = 'all' }, { flush: 'sync' })

// Ook tijdens een detailbezoek mag de volgende sessie geen vorige filtercontext overnemen.
watch(() => currentUser.value?.id, () => {
  mediaTypeFilter.value = 'all'
  statusFilter.value = 'all'
  sortOrder.value = 'recent'
  clearBrowsingPositions('/library')
}, { flush: 'sync' })

export function useLibraryBrowsing() {
  return { mediaTypeFilter, statusFilter, sortOrder }
}
