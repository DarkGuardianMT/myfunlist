import test from 'node:test'
import assert from 'node:assert/strict'

test('collection density validates saved choices, persists changes and tolerates blocked storage', async () => {
  const values = new Map([['myfunlist_collection_view', 'compact']])
  globalThis.window = { localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } }
  try {
    const { useCollectionView } = await import('../src/composables/useCollectionView.js?density-saved')
    const { viewMode, selectView } = useCollectionView()
    assert.equal(viewMode.value, 'compact')
    selectView('list')
    assert.equal(values.get('myfunlist_collection_view'), 'list')
    selectView('unknown')
    assert.equal(viewMode.value, 'list')
    values.set('myfunlist_collection_view', 'invalid-saved-value')
    const restored = await import('../src/composables/useCollectionView.js?density-invalid')
    assert.equal(restored.useCollectionView().viewMode.value, 'comfortable')
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked') } })
    const blocked = await import('../src/composables/useCollectionView.js?density-blocked')
    blocked.useCollectionView().selectView('list')
    assert.equal(blocked.useCollectionView().viewMode.value, 'list')
  } finally {
    delete globalThis.window
  }
})
