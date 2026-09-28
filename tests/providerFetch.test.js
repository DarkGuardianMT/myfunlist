import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchProvider } from '../src/services/providerFetch.js'

test('provider requests abort when an upstream call hangs', async () => {
  await assert.rejects(fetchProvider('https://example.test', {}, async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }), 5), /aborted/)
})
