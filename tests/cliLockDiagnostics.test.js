import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createSshTransport, formatReport, main, recoveryState, remoteCommand, runLockDiagnostics,
  validateInputs, validateResponse } from '../scripts/diagnostics/run-cli-lock-diagnostics.mjs'

const input = { sha: 'a'.repeat(40), run: '12345-1', nonce: 'b'.repeat(32), parent: 'private' }
const response = (phase, result = 'pass', extra = {}) => ({ code: result === 'pass' ? 0 : 1,
  stdout: JSON.stringify({ protocol: 1, phase, result }) + '\n', stderrBytes: 0, signal: null, timedOut: false, ...extra })

function scripted(failure, mutate = value => value) {
  const calls = []
  let releaseHolder
  const holderDone = new Promise(resolve => { releaseHolder = resolve })
  const transport = { start(phase, timeout) {
    calls.push({ phase, timeout })
    const value = mutate(response(phase, phase === failure ? 'fail' : 'pass'), phase)
    if (['contender', 'cleanup'].includes(phase) || (phase === 'ready' && failure === 'ready')) releaseHolder()
    return { completion: phase === 'holder' ? holderDone.then(() => value) : Promise.resolve(value), cancel() {} }
  } }
  return { transport, calls }
}

test('controller uses eight independent invocations, overlaps holder/contender and requires cleanup', async () => {
  const { transport, calls } = scripted()
  const events = []
  const result = await runLockDiagnostics({ transport, record: value => events.push(value) })
  assert.equal(result.success, true)
  assert.deepEqual(calls.map(value => value.phase), ['setup','holder','ready','contender','visibility','reservation','persistence','cleanup'])
  assert.ok(calls.every(value => value.timeout > 0 && value.timeout <= 10000))
  assert.deepEqual(Object.values(result.report), ['pass','pass','pass','pass','pass'])
  assert.ok(events.some(value => value.cleanupAttempted === true))
  assert.deepEqual(events.at(-1), { cleanupVerified: true })
})

for (const phase of ['setup','holder','ready','contender','visibility','reservation','persistence','cleanup']) {
  test(`failed ${phase} never passes or starts later tests and still attempts cleanup`, async () => {
    const { transport, calls } = scripted(phase)
    const result = await runLockDiagnostics({ transport })
    assert.equal(result.success, false)
    assert.equal(calls.at(-1).phase, 'cleanup')
    assert.equal(calls.filter(value => value.phase === phase).length, 1)
    assert.equal(result.report.fixture_cleanup, phase === 'cleanup' ? 'unverified' : 'pass')
    if (phase === 'contender') assert.ok(!calls.some(value => value.phase === 'visibility'))
    if (phase === 'ready') assert.ok(!calls.some(value => value.phase === 'contender'))
  })
}

test('SSH timeout or broken connection never establishes verified cleanup, even after a safe cleanup response', async () => {
  for (const fault of [{ timedOut: true }, { code: 255 }, { signal: 'SIGKILL' }]) {
    const { transport, calls } = scripted(null, (value, phase) => phase === 'setup' ? { ...value, ...fault } : value)
    const waits = []
    const result = await runLockDiagnostics({ transport, sleep: async milliseconds => waits.push(milliseconds) })
    assert.equal(result.success, false)
    assert.equal(result.report.fixture_cleanup, 'unverified')
    assert.deepEqual(calls.map(value => value.phase), ['setup','cleanup'])
    assert.ok(waits.length === 1 && waits[0] <= 10000)
  }
})

test('malformed, skipped, injected or extra-field output is suppressed and cannot pass', async () => {
  const canary = 'PRIVATE_CANARY_NOT_A_SECRET'
  for (const stdout of ['', '{}', 'not_tested', '{invalid',
    JSON.stringify({ protocol: 1, phase: 'setup', result: 'pass', private: canary }) + '\n',
    response('setup').stdout + `::warning::${canary}`, response('setup').stdout.replace('"pass"', '"not_tested"'),
    '{"protocol":1,"phase":"setup","result":"fail","result":"pass"}\n']) {
    const { transport } = scripted(null, (value, phase) => phase === 'setup' ? { ...value, stdout } : value)
    const result = await runLockDiagnostics({ transport })
    assert.equal(result.success, false)
    assert.doesNotMatch(formatReport(result.report), /PRIVATE_CANARY/)
  }
  assert.throws(() => validateResponse(response('setup', 'pass', { stderrBytes: 1 }), 'setup'))
  assert.throws(() => validateResponse(response('ready'), 'setup'))
  assert.throws(() => validateResponse(response('setup', 'pass', { code: 1 }), 'setup'))
  assert.throws(() => formatReport({ unexpected: canary }))
  assert.throws(() => formatReport({ fixture_cleanup: `pass\n${canary}` }))
})

test('whole-attempt budget stops new test phases and reserves cleanup time', async () => {
  let time = 0
  const { transport, calls } = scripted(null, (value, phase) => {
    if (phase === 'setup') time = 40001
    return value
  })
  const result = await runLockDiagnostics({ transport, now: () => time })
  assert.equal(result.success, false)
  assert.deepEqual(calls.map(value => value.phase), ['setup','cleanup'])
  assert.equal(result.report.fixture_cleanup, 'pass')
})

test('an exhausted watchdog-drain window never starts cleanup while remote activity may remain', async () => {
  let time = 0
  const { transport, calls } = scripted(null, (value, phase) => {
    if (phase === 'setup') { time = 55000; return { ...value, timedOut: true } }
    return value
  })
  const result = await runLockDiagnostics({ transport, now: () => time,
    sleep: async () => { throw new Error('No time available for drain') } })
  assert.equal(result.success, false)
  assert.equal(result.report.fixture_cleanup, 'unverified')
  assert.deepEqual(calls.map(value => value.phase), ['setup'])
})

test('journal failure prevents unsafe work and is reported without private error details', async () => {
  const { transport, calls } = scripted()
  const result = await runLockDiagnostics({ transport, record: () => { throw new Error('PRIVATE_CANARY') } })
  assert.equal(result.success, false)
  assert.equal(result.report.fixture_cleanup, 'unverified')
  assert.equal(calls.length, 0)
  assert.doesNotMatch(formatReport(result.report), /PRIVATE_CANARY/)
})

test('recovery requires a complete matching private manifest and never retries attempted cleanup', () => {
  const env = { EXPECTED_STAGING_SHA: input.sha, GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', STORAGE_PARENT: 'private' }
  const journal = { ...input, cleanupAttempted: false, cleanupVerified: false, lastStartedAt: 0 }
  assert.equal(recoveryState(journal, env), 'attempt')
  assert.equal(recoveryState({ ...journal, phase: 'cleanup', cleanupAttempted: true }, env), 'unverified')
  assert.equal(recoveryState({ ...journal, phase: 'cleanup', cleanupAttempted: true, cleanupVerified: true }, env), 'verified')
  for (const changes of [{ sha: 'c'.repeat(40) }, { run: '999-1' }, { parent: 'local_state' },
    { cleanupVerified: true }, { cleanupAttempted: true }, { cleanupVerified: 'pass' },
    { lastStartedAt: -1 }, { lastStartedAt: Infinity }, { lastStartedAt: Date.now() + 60000 },
    { phase: 'invalid' }, { private: 'PRIVATE_CANARY' }]) {
    assert.throws(() => recoveryState({ ...journal, ...changes }, env))
  }
})

test('remote command checks SHA for every phase and has a process-group watchdog, no subprocess PHP', () => {
  for (const phase of ['setup','holder','ready','contender','visibility','reservation','persistence','cleanup']) {
    const command = remoteCommand(input, phase)
    assert.match(command, /^timeout --signal=KILL 8s sh -c '/)
    assert.match(command, /test "\$\(git rev-parse HEAD\)" = "a{40}" && exec php/)
    assert.match(command, /-d display_errors=0 -d log_errors=0 \/dev\/stdin/)
    assert.doesNotMatch(command, /proc_open|git reset|git pull|chmod|curl|wget/)
  }
  for (const field of ['sha','run','nonce','parent']) {
    assert.throws(() => validateInputs({ ...input, [field]: "x' $(invalid)\n" }))
    assert.throws(() => remoteCommand({ ...input, [field]: '' }, 'cleanup'))
  }
  assert.throws(() => remoteCommand(input, 'unknown'))
})

test('SSH transport streams the worker without a shell and contains stderr, excess output and timeouts', async () => {
  for (const scenario of ['pass','stderr','oversized','timeout','error']) {
    const observed = []
    const transport = createSshTransport(input, '/synthetic/config', (command, args, options) => {
      observed.push({ command, args, options })
      const child = new EventEmitter()
      child.stdin = new PassThrough()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = () => { queueMicrotask(() => child.emit('close', null, 'SIGKILL')); return true }
      queueMicrotask(() => {
        if (scenario === 'error') { child.emit('error', new Error('PRIVATE_CANARY')); return }
        if (scenario === 'timeout') return
        child.stdout.write(scenario === 'oversized' ? 'PRIVATE_CANARY'.repeat(200) : response('setup').stdout)
        if (scenario === 'stderr') child.stderr.write('PRIVATE_CANARY')
        if (scenario !== 'oversized') child.emit('close', 0, null)
      })
      return child
    })
    const result = await transport.start('setup', 10).completion
    assert.equal(observed[0].command, 'ssh')
    assert.equal(observed[0].options.shell, false)
    assert.deepEqual(Object.keys(observed[0].options.env).sort(), ['LANG','LC_ALL','PATH'])
    assert.deepEqual(observed[0].args.slice(0, 3), ['-F','/synthetic/config','staging'])
    if (scenario === 'pass') assert.equal(validateResponse(result, 'setup'), true)
    else assert.throws(() => validateResponse(result, 'setup'))
    if (scenario !== 'oversized') assert.doesNotMatch(result.stdout, /PRIVATE_CANARY/)
  }
})

test('entrypoint fails closed without runtime/approval and prints only safe statuses', async () => {
  const result = await main({ CONFIRM_CLI_LOCK_DIAGNOSTICS: 'false' }, 'run')
  assert.equal(result.success, false)
  const script = fileURLToPath(new URL('../scripts/diagnostics/run-cli-lock-diagnostics.mjs', import.meta.url))
  const execution = spawnSync(process.execPath, [script], { encoding: 'utf8',
    env: { ...process.env, CONFIRM_CLI_LOCK_DIAGNOSTICS: 'false', STAGING_SSH_KEY: 'PRIVATE_CANARY', GITHUB_STEP_SUMMARY: '' } })
  assert.equal(execution.status, 1)
  assert.doesNotMatch(execution.stdout + execution.stderr, /PRIVATE_CANARY|Error:| at /)
  assert.match(execution.stdout, /fixture_cleanup.*unverified/)
})

test('manual workflow preserves approval, host-pin helper, SHA, concurrency and recovery gates', () => {
  const workflow = readFileSync(new URL('../.github/workflows/staging-cli-lock-diagnostics.yml', import.meta.url), 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /default: false/)
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main' && inputs.confirm_reviewed/)
  assert.match(workflow, /group: deploy-staging\s+cancel-in-progress: false\s+queue: max/)
  assert.match(workflow, /expected_staging_sha:[\s\S]*?required: true/)
  assert.match(workflow, /STAGING_SSH_HOST_KEY: \$\{\{ secrets.STAGING_SSH_HOST_KEY \}\}/)
  assert.match(workflow, /Verify disposable fixture cleanup\s+if: always\(\)/)
  assert.match(workflow, /Remove runner credentials and private manifest\s+if: always\(\)/)
  assert.ok(workflow.indexOf('Validate isolated Linux fixtures before SSH') < workflow.indexOf('id: execution'))
  assert.doesNotMatch(workflow, /ssh-keyscan|pull_request:|push:|schedule:|upload-artifact|set -x/)
})
