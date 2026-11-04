import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { flags, runPlan } from '../diagnostics/web-worker/runner.mjs'

const helper = fileURLToPath(new URL('./support/web-worker-fixture.php', import.meta.url))
const available = spawnSync('php', ['-r', 'exit(PHP_OS_FAMILY === "Linux" && function_exists("posix_geteuid") ? 0 : 1);'])
const linux = { skip: process.platform !== 'linux' || available.status !== 0
  ? 'Local Linux PHP/POSIX required; no HTTP/server or Hostinger substitute is used.' : false }

async function fixture(callback) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'mfl-web-worker-')))
  chmodSync(home, 0o700)
  for (const name of ['private','public','checkout']) mkdirSync(join(home, name), { mode: 0o700 })
  const config = { version: 1, owner_approved: true, armed: false, issued_at: 1800000000, expires_at: 1800000900,
    expected_sapi: 'fpm-fcgi', endpoint_path: '/fixture', basic_user_hash: 'a'.repeat(64), boundary_secret: 'b'.repeat(64),
    request_key_hash: 'c'.repeat(64), package_hash: 'f'.repeat(64), run_nonce: 'd'.repeat(64),
    fixture_parent: join(home, 'private'), excluded_roots: [join(home, 'public'),join(home, 'checkout')] }
  const root = join(config.fixture_parent, '.myfunlist-web-worker-' + config.run_nonce)
  const invoke = (action, override = {}) => spawnSync('php', ['-d','display_errors=0','-d','log_errors=0',helper,action],
    { input: JSON.stringify({ ...config, ...override }), encoding: 'utf8', timeout: 10000 })
  const send = (action, timeout) => new Promise(resolveResult => {
    let body = ''
    let errors = 0
    const child = spawn('php', ['-d','display_errors=0','-d','log_errors=0',helper,action], { stdio: ['pipe','pipe','pipe'] })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
    child.stdout.on('data', value => { body += value })
    child.stderr.on('data', value => { errors += value.length })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolveResult({ code: code === 0 ? 200 : 503, uncertain: Boolean(signal) || errors > 0, body })
    })
    child.stdin.end(JSON.stringify(config))
  })
  try { return await callback({ home, config, root, invoke, send }) }
  finally {
    // Alleen de eigen tijdelijke lokale sandbox; symlinks worden niet gevolgd.
    rmSync(home, { recursive: true, force: true })
  }
}

function passed(execution) {
  assert.equal(execution.status, 0)
  assert.equal(execution.stderr, '')
  return JSON.parse(execution.stdout)
}
function failed(execution) {
  assert.equal(execution.status, 1)
  assert.equal(execution.stderr, '')
  assert.equal(JSON.parse(execution.stdout).status, 'inconclusive')
}

test('synthetic file protocol uses concurrent independent local PHP processes and removes every fixture', linux, async () => {
  await fixture(async ({ invoke, send, root }) => {
    passed(invoke('prepare'))
    const result = await runPlan(send)
    assert.equal(result.status, 'pass')
    assert.ok(flags.every(name => result[name]))
    assert.equal(existsSync(root), false)
  })
})

test('sequential worker requests cannot establish concurrency or a cross-worker pass', linux, async () => {
  await fixture(async ({ invoke, root }) => {
    passed(invoke('prepare'))
    passed(invoke('attest'))
    failed(invoke('holder'))
    failed(invoke('ready'))
    failed(invoke('contender'))
    const result = passed(invoke('offline-cleanup'))
    assert.equal(result.status, 'removed')
    assert.equal(result.concurrency_confirmed, false)
    assert.equal(existsSync(root), false)
  })
})

test('HTTP-path cleanup refuses an active lease; offline cleanup succeeds only after processes finish', linux, async () => {
  await fixture(async ({ invoke, send, root }) => {
    passed(invoke('prepare'))
    passed(invoke('attest'))
    const holding = send('holder', 5000)
    passed(invoke('ready'))
    failed(invoke('cleanup'))
    assert.equal(existsSync(root), true)
    assert.equal((await holding).code, 503)
    const result = passed(invoke('offline-cleanup'))
    assert.equal(result.cleanup, true)
    assert.equal(result.concurrency_confirmed, false)
  })
})

test('wrong inode, hardlink, symlink, unknown content or extra files block cleanup without deletion', linux, async () => {
  for (const fault of ['inode','hardlink','symlink','content','extra']) {
    await fixture(async ({ config, invoke, root }) => {
      passed(invoke('prepare'))
      const target = join(root, 'fixture')
      const saved = join(config.fixture_parent, 'saved')
      if (fault === 'content') writeFileSync(target, 'DO_NOT_TOUCH')
      else if (fault === 'extra') writeFileSync(join(root, 'unrelated'), 'DO_NOT_TOUCH', { mode: 0o600 })
      else {
        renameSync(target, saved)
        if (fault === 'inode') writeFileSync(target, '', { mode: 0o600 })
        if (fault === 'symlink') symlinkSync(saved, target)
        if (fault === 'hardlink') linkSync(saved, target)
      }
      failed(invoke('offline-cleanup'))
      assert.equal(existsSync(root), true)
      if (existsSync(saved)) assert.equal(readFileSync(saved, 'utf8'), '')
    })
  }
})

test('missing ownership proof, public/unsafe parent and existing directory are never repaired or reused', linux, async () => {
  await fixture(async ({ config, invoke, root }) => {
    chmodSync(config.fixture_parent, 0o755)
    failed(invoke('prepare'))
    chmodSync(config.fixture_parent, 0o700)
    failed(invoke('prepare', { excluded_roots: [config.fixture_parent,...config.excluded_roots] }))
    passed(invoke('prepare'))
    failed(invoke('prepare'))
    unlinkSync(join(root, 'owner'))
    failed(invoke('offline-cleanup'))
    assert.equal(existsSync(join(root, 'fixture')), true)
  })
})

test('request cap never resets; exhausted or replayed actions require safe offline removal', linux, async () => {
  await fixture(async ({ invoke, root }) => {
    passed(invoke('prepare'))
    passed(invoke('attest'))
    const ledgerPath = join(root, 'ledger')
    const state = JSON.parse(readFileSync(ledgerPath, 'utf8'))
    state.count = 6
    writeFileSync(ledgerPath, JSON.stringify(state))
    failed(invoke('holder'))
    failed(invoke('cleanup'))
    assert.equal(JSON.parse(readFileSync(ledgerPath, 'utf8')).count, 7)
    assert.equal(passed(invoke('offline-cleanup')).cleanup, true)
  })
})

test('endpoint refuses native CLI before configuration/fixture access and emits only safe booleans/status', () => {
  const endpoint = fileURLToPath(new URL('../diagnostics/web-worker/endpoint.php', import.meta.url))
  const result = spawnSync('php', ['-d','display_errors=0','-d','log_errors=0',endpoint], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
  const data = JSON.parse(result.stdout)
  assert.equal(data.status, 'denied')
  assert.deepEqual(Object.keys(data), ['status',...flags])
  assert.ok(flags.every(name => data[name] === false))
})
