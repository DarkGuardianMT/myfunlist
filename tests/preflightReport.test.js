import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const formatter = new URL('../scripts/diagnostics/print-preflight-report.mjs', import.meta.url)
function format(raw, args = []) {
  const directory = mkdtempSync(join(tmpdir(), 'mfl-safe-report-'))
  try {
    const input = join(directory, 'report.json')
    const summary = join(directory, 'summary.md')
    writeFileSync(input, raw)
    const result = spawnSync(process.execPath, [fileURLToPath(formatter), input, ...args],
      { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summary } })
    return { ...result, summary: result.status === 0 ? readFileSync(summary, 'utf8') : '' }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('diagnostic formatter prints only approved status fields and a numerical PHP version', () => {
  const report = format(JSON.stringify({ php_version: '8.3.35', php_sapi: 'cli', fixture_cleanup: 'pass',
    OPEN_LIBRARY_USER_AGENT: 'valid_syntax_only', RATE_LIMIT_SECRET: 'valid_length_only', web_worker_flock: 'requires_http_test' }))
  assert.equal(report.status, 0)
  assert.match(report.stdout, /`php_version`: `8.3.35`/)
  assert.match(report.stdout, /`web_worker_flock`: `requires_http_test`/)
  assert.equal(report.summary.trim(), report.stdout.trim())
})

test('cleanup verification requires an explicit pass without relaxing private-output filtering', () => {
  for (const report of [{ php_version: '8.3.35' }, { fixture_cleanup: 'not_tested' },
    { fixture_cleanup: 'fail' }, { fixture_cleanup: 'pass', private: 'CANARY_NOT_A_REAL_SECRET' }]) {
    const result = format(JSON.stringify(report), ['--require-cleanup'])
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.doesNotMatch(result.stderr, /CANARY_NOT_A_REAL_SECRET/)
  }
  assert.equal(format(JSON.stringify({ fixture_cleanup: 'pass' }), ['--require-cleanup']).status, 0)
})

test('diagnostic formatter suppresses unknown keys, raw values, injection, malformed and excessive output', () => {
  const canary = 'CANARY_NOT_A_REAL_SECRET'
  for (const raw of [JSON.stringify({ unexpected: canary }), JSON.stringify({ fixture_cleanup: 'pass', unexpected: canary }),
    JSON.stringify({ OPEN_LIBRARY_USER_AGENT: canary }), JSON.stringify({ RATE_LIMIT_SECRET: canary }),
    JSON.stringify({ php_version: `8.3.35 ${canary}` }), JSON.stringify({ fixture_cleanup: `pass\n::warning::${canary}` }),
    JSON.stringify({ fixture_cleanup: { value: canary } }), JSON.stringify([canary]), `{${canary}`, '{}',
    JSON.stringify({ fixture_cleanup: canary.repeat(2000) })]) {
    const result = format(raw)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.doesNotMatch(result.stderr, new RegExp(canary))
    assert.match(result.stderr, /raw output is suppressed/)
  }
})

test('diagnostic failures remain failures while cleanup and missing prerequisites are reported honestly', () => {
  for (const report of [{ fixture_cleanup: 'fail' }, { cli_flock_contention: 'fail', fixture_cleanup: 'pass' },
    { fatal: 'inspection_failed', fixture_cleanup: 'not_tested' }]) {
    assert.equal(format(JSON.stringify(report)).status, 1)
  }
  assert.equal(format(JSON.stringify({ fixture_cleanup: 'pass' })).status, 0)
  assert.equal(format(JSON.stringify({ candidate_private: 'absent', cli_flock_contention: 'not_tested', fixture_cleanup: 'not_tested' })).status, 0)
})
