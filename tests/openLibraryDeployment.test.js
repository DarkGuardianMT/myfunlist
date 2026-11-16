import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { verifyOpenLibraryConfiguration, verifyOpenLibraryPilot } from '../scripts/verifyOpenLibraryPilot.mjs'

test('staging verification accepts exactly one status/code per explicit access mode', () => {
  const modes = [
    ['disabled', 'false', '404', 'not_found'],
    ['tester-only', 'true', '401', 'unauthenticated'],
    ['public', 'true', '422', 'validation_error'],
  ]
  for (const [mode, flag, status, code] of modes) {
    assert.doesNotThrow(() => verifyOpenLibraryPilot(status, { error: { code } }, mode, flag))
    for (const [, , otherStatus, otherCode] of modes.filter(row => row[0] !== mode)) {
      assert.throws(() => verifyOpenLibraryPilot(otherStatus, { error: { code: otherCode } }, mode, flag))
    }
    for (const otherStatus of ['200', '403', '429', '503']) {
      assert.throws(() => verifyOpenLibraryPilot(otherStatus, { error: { code } }, mode, flag))
    }
    for (const payload of [null, {}, { error: { code: 'provider_unavailable' } }]) {
      assert.throws(() => verifyOpenLibraryPilot(status, payload, mode, flag))
    }
    for (const invalidFlag of [undefined, '', 'TRUE', '1', flag === 'true' ? 'false' : 'true']) {
      assert.throws(() => verifyOpenLibraryConfiguration(mode, invalidFlag))
    }
  }
  for (const mode of [undefined, '', 'true', 'PUBLIC', 'tester', '__proto__', 'constructor']) {
    assert.throws(() => verifyOpenLibraryConfiguration(mode, 'true'))
  }
})

test('staging verifier CLI fails safely on malformed responses without logging their contents', () => {
  const directory = mkdtempSync(join(tmpdir(), 'myfunlist-pilot-check-'))
  const file = join(directory, 'response.json')
  try {
    for (const [body, status, mode, expected] of [
      ['{"error":{"code":"unauthenticated"}}', '401', 'tester-only', 0],
      ['{"error":{"code":"validation_error"}}', '422', 'public', 0],
      ['{"error":{"code":"unauthenticated"}}', '401', 'public', 1],
      ['{"error":{"code":"validation_error"}}', '422', '', 1],
      ['{"error":{"code":"not_found"}}', '404', 'tester-only', 1],
      ['synthetic-private-marker', '422', 'public', 1],
    ]) {
      writeFileSync(file, body)
      const result = spawnSync(process.execPath, ['scripts/verifyOpenLibraryPilot.mjs', status, file], {
        encoding: 'utf8', env: { ...process.env, VITE_OPEN_LIBRARY_DISCOVER_ENABLED: 'true', OPEN_LIBRARY_EXPECTED_ACCESS_MODE: mode },
      })
      assert.equal(result.status, expected)
      assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-marker/)
    }
  } finally {
    rmSync(file, { force: true })
    rmdirSync(directory)
  }
})

test('staging validates explicit configuration before SSH and keeps the anonymous probe queryless without retries', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-staging.yml', import.meta.url), 'utf8')
  assert.match(workflow, /env:\s+VITE_OPEN_LIBRARY_DISCOVER_ENABLED: '(?:true|false)'/)
  assert.equal((workflow.match(/VITE_OPEN_LIBRARY_DISCOVER_ENABLED:/g) || []).length, 1)
  assert.match(workflow, /OPEN_LIBRARY_EXPECTED_ACCESS_MODE: \$\{\{ vars\.OPEN_LIBRARY_EXPECTED_ACCESS_MODE \}\}/)
  assert.ok(workflow.indexOf('verifyOpenLibraryConfiguration(process.env.') < workflow.indexOf('- name: Configure SSH'))
  const probe = workflow.slice(workflow.indexOf('- name: Verify expected Open Library pilot state'), workflow.indexOf('- name: Remove SSH credentials'))
  assert.doesNotMatch(probe, /--retry|--cookie|[?&]q=|--location/)
  assert.match(workflow, /https:\/\/lightcyan-snake-955164\.hostingersite\.com\/api\/v1\/pilot\/open-library\/search\)\s+node scripts\/verifyOpenLibraryPilot\.mjs "\$status"/)
})
