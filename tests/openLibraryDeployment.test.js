import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { verifyOpenLibraryPilot } from '../scripts/verifyOpenLibraryPilot.mjs'

test('staging pilot verification accepts only the response for its explicit build flag', () => {
  const disabled = { error: { code: 'not_found' } }
  const enabled = { error: { code: 'validation_error' } }
  assert.doesNotThrow(() => verifyOpenLibraryPilot('404', disabled, 'false'))
  assert.doesNotThrow(() => verifyOpenLibraryPilot('422', enabled, 'true'))
  assert.throws(() => verifyOpenLibraryPilot('404', disabled, 'true'))
  assert.throws(() => verifyOpenLibraryPilot('422', enabled, 'false'))
  for (const flag of [undefined, '', 'TRUE', '1']) assert.throws(() => verifyOpenLibraryPilot('404', disabled, flag))
  for (const status of ['200', '429', '503']) assert.throws(() => verifyOpenLibraryPilot(status, enabled, 'true'))
  for (const payload of [null, {}, disabled, { error: { code: 'provider_unavailable' } }]) {
    assert.throws(() => verifyOpenLibraryPilot('422', payload, 'true'))
  }
})

test('staging verifier CLI fails safely on malformed responses without logging their contents', () => {
  const directory = mkdtempSync(join(tmpdir(), 'myfunlist-pilot-check-'))
  const file = join(directory, 'response.json')
  try {
    for (const [body, status, expected] of [
      ['{"error":{"code":"validation_error"}}', '422', 0],
      ['{"error":{"code":"not_found"}}', '404', 1],
      ['synthetic-private-marker', '422', 1],
    ]) {
      writeFileSync(file, body)
      const result = spawnSync(process.execPath, ['scripts/verifyOpenLibraryPilot.mjs', status, file], {
        encoding: 'utf8', env: { ...process.env, VITE_OPEN_LIBRARY_DISCOVER_ENABLED: 'true' },
      })
      assert.equal(result.status, expected)
      assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-marker/)
    }
  } finally {
    rmSync(file, { force: true })
    rmdirSync(directory)
  }
})

test('staging build and pilot assertion share one flag and keep the probe queryless', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-staging.yml', import.meta.url), 'utf8')
  assert.match(workflow, /env:\s+VITE_OPEN_LIBRARY_DISCOVER_ENABLED: '(?:true|false)'/)
  assert.equal((workflow.match(/VITE_OPEN_LIBRARY_DISCOVER_ENABLED:/g) || []).length, 1)
  assert.match(workflow, /https:\/\/lightcyan-snake-955164\.hostingersite\.com\/api\/v1\/pilot\/open-library\/search\)\s+node scripts\/verifyOpenLibraryPilot\.mjs "\$status"/)
})
