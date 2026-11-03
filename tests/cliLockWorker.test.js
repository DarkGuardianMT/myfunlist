import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runLockDiagnostics } from '../scripts/diagnostics/run-cli-lock-diagnostics.mjs'

const worker = fileURLToPath(new URL('../scripts/diagnostics/cli-lock-worker.php', import.meta.url))
const available = spawnSync('php', ['-r', 'exit(PHP_OS_FAMILY === "Linux" && function_exists("posix_geteuid") ? 0 : 1);'], { encoding: 'utf8' })
const linuxOnly = { skip: process.platform !== 'linux' || available.status !== 0
  ? 'Requires local Linux PHP/POSIX; never substitutes a remote host or weakens production guards.' : false }
const run = '24680-1'
const nonce = 'd'.repeat(32)

async function fixture(callback) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'mfl-cli-fixture-')))
  chmodSync(home, 0o700)
  const parent = join(home, 'private')
  const backend = join(home, 'myfunlist-stage', 'backend')
  mkdirSync(parent, { mode: 0o700 })
  mkdirSync(join(backend, 'config'), { recursive: true })
  const loader = join(backend, 'config', 'environment.php')
  // Een volledig geïsoleerde loader; nooit echte configuratie of applicatiecode lezen.
  const setEnvironment = values => writeFileSync(loader, '<?php\n' + Object.entries({
    OPEN_LIBRARY_PILOT_ENABLED: 'false', OPEN_LIBRARY_STATE_FILE: '', ...values,
  }).map(([key, value]) => `$_ENV['${key}'] = '${value.replaceAll("'", "\\'")}';`).join('\n'))
  setEnvironment({})
  const directory = join(parent, `.myfunlist-cli-lock-${run}-${nonce}`)
  const invoke = (phase, options = {}) => spawnSync('php', ['-d','display_errors=0','-d','log_errors=0',
    worker, phase, run, nonce, 'private'], { cwd: backend, encoding: 'utf8', timeout: 10000, ...options })
  const transport = { start(phase, timeout) {
    const child = spawn('php', ['-d','display_errors=0','-d','log_errors=0', worker, phase, run, nonce, 'private'],
      { cwd: backend, stdio: ['ignore','pipe','pipe'] })
    let stdout = ''
    let stderrBytes = 0
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeout)
    child.stdout.on('data', value => { stdout += value })
    child.stderr.on('data', value => { stderrBytes += value.length })
    const completion = new Promise(resolve => child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout, stderrBytes, timedOut })
    }))
    return { completion, cancel: () => child.kill('SIGKILL') }
  } }
  try { return await callback({ home, parent, backend, directory, invoke, transport, setEnvironment }) }
  finally {
    // Alleen de door deze test aangemaakte lokale sandbox; geen server of echte opslag.
    rmSync(home, { recursive: true, force: true })
  }
}

function passed(result, phase) {
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), { protocol: 1, phase, result: 'pass' })
}

function failed(result, phase) {
  assert.equal(result.status, 1)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), { protocol: 1, phase, result: 'fail' })
}

test('local independent PHP processes verify contention, release, visibility, reservation and exact cleanup', linuxOnly, async () => {
  await fixture(async ({ transport, directory }) => {
    const result = await runLockDiagnostics({ transport })
    assert.equal(result.success, true)
    assert.deepEqual(Object.values(result.report), ['pass','pass','pass','pass','pass'])
    assert.equal(existsSync(directory), false)
  })
})

test('worker refuses enabled pilot, unsafe parent, absent parent and pre-existing directory without overwrites', linuxOnly, async () => {
  await fixture(async ({ parent, directory, invoke, setEnvironment }) => {
    for (const value of ['true', 'TRUE', '1', 'invalid']) {
      setEnvironment({ OPEN_LIBRARY_PILOT_ENABLED: value })
      failed(invoke('setup'), 'setup')
      assert.equal(existsSync(directory), false)
    }
    setEnvironment({})
    chmodSync(parent, 0o755)
    failed(invoke('setup'), 'setup')
    chmodSync(parent, 0o700)
    renameSync(parent, parent + '-saved')
    failed(invoke('setup'), 'setup')
    renameSync(parent + '-saved', parent)
    mkdirSync(directory, { mode: 0o700 })
    writeFileSync(join(directory, 'unrelated'), 'DO_NOT_TOUCH', { mode: 0o600 })
    failed(invoke('setup'), 'setup')
    failed(invoke('cleanup'), 'cleanup')
    assert.equal(readFileSync(join(directory, 'unrelated'), 'utf8'), 'DO_NOT_TOUCH')
  })
})

test('worker rejects replaced inode, symlinks, hardlinks and unexpected cleanup content', linuxOnly, async () => {
  for (const fault of ['inode','symlink','hardlink','content','unexpected']) {
    await fixture(async ({ parent, directory, invoke }) => {
      passed(invoke('setup'), 'setup')
      const target = join(directory, 'fixture')
      const original = join(parent, 'original')
      if (fault === 'content') writeFileSync(target, 'DO_NOT_TOUCH')
      else if (fault === 'unexpected') writeFileSync(join(directory, 'unrelated'), 'DO_NOT_TOUCH', { mode: 0o600 })
      else {
        renameSync(target, original)
        if (fault === 'inode') writeFileSync(target, '', { mode: 0o600 })
        if (fault === 'symlink') symlinkSync(original, target)
        if (fault === 'hardlink') linkSync(original, target)
      }
      failed(invoke('visibility'), 'visibility')
      failed(invoke('cleanup'), 'cleanup')
      assert.equal(existsSync(directory), true)
      if (existsSync(original)) assert.equal(readFileSync(original, 'utf8'), '')
    })
  }
})

test('configured real-state collision, relative state and partial setup remain untouched', linuxOnly, async () => {
  await fixture(async ({ directory, invoke, setEnvironment }) => {
    passed(invoke('setup'), 'setup')
    const path = join(directory, 'fixture')
    setEnvironment({ OPEN_LIBRARY_STATE_FILE: path })
    failed(invoke('visibility'), 'visibility')
    failed(invoke('cleanup'), 'cleanup')
    assert.equal(readFileSync(path, 'utf8'), '')
    setEnvironment({ OPEN_LIBRARY_STATE_FILE: '../invalid' })
    failed(invoke('cleanup'), 'cleanup')
    setEnvironment({})
    unlinkSync(join(directory, 'identity'))
    failed(invoke('cleanup'), 'cleanup')
    assert.equal(existsSync(path), true)
  })
})

test('unconfirmed overlap, stale marker and absent reservation cannot pass', linuxOnly, async () => {
  await fixture(async ({ directory, invoke }) => {
    passed(invoke('setup'), 'setup')
    failed(invoke('contender'), 'contender')
    failed(invoke('persistence'), 'persistence')
    failed(invoke('holder'), 'holder')
    assert.equal(readFileSync(join(directory, 'ack'), 'utf8'), '')
    passed(invoke('cleanup'), 'cleanup')
    passed(invoke('cleanup'), 'cleanup')
  })
})

test('cleanup cannot unlink a fixture while an independent holder still uses it', linuxOnly, async () => {
  await fixture(async ({ directory, invoke, transport }) => {
    passed(invoke('setup'), 'setup')
    const holder = transport.start('holder', 10000)
    passed(invoke('ready'), 'ready')
    failed(invoke('cleanup'), 'cleanup')
    assert.equal(existsSync(directory), true)
    const completion = await holder.completion
    assert.equal(completion.code, 1)
    passed(invoke('cleanup'), 'cleanup')
  })
})

test('native unsupported runtime rejects before touching any fixture and keeps errors private', { skip: available.error ? 'Local PHP unavailable' : false }, () => {
  const execution = spawnSync('php', ['-d','display_errors=0','-d','log_errors=0', worker,
    'invalid', 'PRIVATE_CANARY', nonce, 'private'], { encoding: 'utf8' })
  failed(execution, 'invalid')
  assert.doesNotMatch(execution.stdout + execution.stderr, /PRIVATE_CANARY|Warning|Exception|[A-Z]:\\/)
})
