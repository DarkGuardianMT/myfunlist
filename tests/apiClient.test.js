import test from 'node:test'
import assert from 'node:assert/strict'
import { clearCsrfToken, request } from '../src/services/apiClient.js'

const response = (payload, status = 200) => ({
  status, ok: status >= 200 && status < 300, json: async () => payload,
})

test('unwraps data and sends same-origin credentials with CSRF on mutations', async () => {
  clearCsrfToken()
  const calls = []
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    return path.endsWith('/csrf')
      ? response({ data: { csrfToken: 'test-token' } })
      : response({ data: { saved: true } })
  }
  assert.deepEqual(await request('/api/v1/library'), { saved: true })
  assert.deepEqual(await request('/api/v1/library', { method: 'POST', body: { value: 1 } }), { saved: true })
  assert.equal(calls.length, 3)
  assert.ok(calls.every((call) => call.options.credentials === 'same-origin'))
  assert.equal(calls[2].options.headers['X-CSRF-Token'], 'test-token')
})

test('preserves structured errors and handles network and malformed responses', async () => {
  globalThis.fetch = async () => response({ error: {
    code: 'validation_error', message: 'Check the fields.', fields: { email: 'Invalid email.' },
  } }, 422)
  await assert.rejects(request('/api/v1/test'), { code: 'validation_error', status: 422,
    fields: { email: 'Invalid email.' } })
  globalThis.fetch = async () => { throw new Error('offline') }
  await assert.rejects(request('/api/v1/test'), { code: 'network_error' })
  globalThis.fetch = async () => ({ status: 502, ok: false, json: async () => { throw new Error('html') } })
  await assert.rejects(request('/api/v1/test'), { code: 'invalid_response' })
})
