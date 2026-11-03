import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { configurePreflightSsh } from './configure-preflight-ssh.mjs'

const phases = ['setup', 'holder', 'ready', 'contender', 'visibility', 'reservation', 'persistence', 'cleanup']
const aliases = ['configured_parent', 'private', 'local_state']
const emptyReport = () => ({ cli_contention: 'not_tested', cli_lock_release: 'not_tested',
  cli_shared_visibility: 'not_tested', cli_reservation_persistence: 'not_tested', fixture_cleanup: 'unverified' })
const fail = () => { throw new Error('CLI locking diagnostic failed; private details are suppressed.') }

export function validateInputs({ sha, run, nonce, parent }) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[0-9]{1,20}-[0-9]{1,5}$/.test(run ?? '') ||
    !/^[a-f0-9]{32}$/.test(nonce ?? '') || !aliases.includes(parent)) fail()
}

export function remoteCommand(input, phase) {
  validateInputs(input)
  if (!phases.includes(phase)) fail()
  // Alle geïnterpoleerde waarden zijn vooraf begrensde hex-, cijfer- of enumwaarden.
  const command = `cd "$HOME/myfunlist-stage/backend" && test "$(git rev-parse HEAD)" = "${input.sha}" && ` +
    `exec php -d display_errors=0 -d log_errors=0 /dev/stdin ${phase} ${input.run} ${input.nonce} ${input.parent}`
  return `timeout --signal=KILL 8s sh -c '${command}'`
}

export function validateResponse(response, phase) {
  if (!response || response.timedOut || response.signal || response.stderrBytes !== 0 ||
    ![0, 1].includes(response.code) || typeof response.stdout !== 'string' || response.stdout.length > 1024) fail()
  let data
  try { data = JSON.parse(response.stdout) } catch { fail() }
  if (!data || Array.isArray(data) || Object.keys(data).sort().join(',') !== 'phase,protocol,result' ||
    data.protocol !== 1 || data.phase !== phase || !['pass', 'fail'].includes(data.result) ||
    response.code !== (data.result === 'pass' ? 0 : 1) || response.stdout !== JSON.stringify(data) + '\n') fail()
  return data.result === 'pass'
}

export function createSshTransport(input, config, spawnProcess = spawn) {
  validateInputs(input)
  const workerSource = readFileSync(new URL('./cli-lock-worker.php', import.meta.url), 'utf8')
  return {
    start(phase, timeoutMs) {
      const remote = remoteCommand(input, phase)
      let process
      let timer
      let finished = false
      let stdout = ''
      let stdoutBytes = 0
      let stderrBytes = 0
      let timedOut = false
      let cancel = () => {}
      const completion = new Promise(resolveResult => {
        const finish = (code, signal) => {
          if (finished) return
          finished = true
          clearTimeout(timer)
          resolveResult({ code, signal, stdout, stderrBytes, timedOut })
        }
        try {
          process = spawnProcess('ssh', ['-F', config, 'staging', remote], { stdio: ['pipe', 'pipe', 'pipe'], shell: false,
            env: { PATH: globalThis.process.env.PATH ?? '', LANG: 'C', LC_ALL: 'C' } })
          cancel = () => {
            if (finished) return
            timedOut = true
            try { process.kill('SIGKILL') } catch { finish(null, 'kill_error') }
          }
          timer = setTimeout(cancel, Math.max(1, Math.min(10000, timeoutMs)))
          process.stdout.on('data', chunk => {
            stdoutBytes += chunk.length
            if (stdoutBytes > 1024) { stdout = ''; cancel(); return }
            stdout += chunk.toString('utf8')
          })
          // Ruwe SSH-uitvoer wordt niet opgeslagen, doorgegeven of afgedrukt.
          process.stderr.on('data', chunk => { stderrBytes += chunk.length })
          process.stdin.on('error', () => { cancel() })
          process.on('error', () => { finish(null, 'spawn_error') })
          process.on('close', finish)
          process.stdin.end(workerSource)
        } catch { finish(null, 'spawn_error') }
      })
      return { completion, cancel: () => cancel() }
    },
  }
}

export async function runLockDiagnostics({ transport, record = () => {}, now = () => performance.now(),
  sleep = milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds)) }) {
  const report = emptyReport()
  const started = now()
  const operations = []
  let lastClosed = started
  let uncertain = false
  let passed = false
  function begin(phase) {
    const remaining = (phase === 'cleanup' ? 60000 : 40000) - (now() - started)
    if (remaining <= 0 || operations.length >= 8) fail()
    record({ phase, cleanupAttempted: phase === 'cleanup', lastStartedAt: Date.now() })
    const operation = transport.start(phase, Math.min(10000, remaining))
    const completion = operation.completion.then(response => {
      lastClosed = now()
      if (!response || response.timedOut || response.signal || ![0, 1].includes(response.code)) uncertain = true
      return validateResponse(response, phase)
    }).catch(() => { throw new Error('CLI locking diagnostic failed; private details are suppressed.') })
    // De holder loopt tegelijk; voorkom een onbehandelde afwijzing vóór de join.
    completion.catch(() => {})
    const tracked = { ...operation, completion }
    operations.push(tracked)
    return tracked
  }
  try {
    if (!await begin('setup').completion) fail()
    const holder = begin('holder')
    if (!await begin('ready').completion) fail()
    if (!await begin('contender').completion || !await holder.completion) fail()
    report.cli_contention = 'pass'
    if (!await begin('visibility').completion) fail()
    report.cli_lock_release = 'pass'
    if (!await begin('reservation').completion) fail()
    report.cli_shared_visibility = 'pass'
    if (!await begin('persistence').completion) fail()
    report.cli_reservation_persistence = 'pass'
    passed = true
  } catch {
    // Geen volgende testfase of automatische herhaling na een onzekere uitkomst.
  } finally {
    await Promise.allSettled(operations.map(operation => operation.completion))
    let canClean = true
    if (uncertain) {
      // De externe watchdog moet ook na een verbroken SSH-verbinding kunnen aflopen.
      const wait = Math.max(0, 10000 - (now() - lastClosed))
      if (now() - started + wait <= 50000) await sleep(wait)
      else canClean = false
    }
    try {
      if (canClean && await begin('cleanup').completion) {
        report.fixture_cleanup = uncertain ? 'unverified' : 'pass'
        record({ cleanupVerified: report.fixture_cleanup === 'pass' })
      }
    } catch { /* Opruiming zonder onafhankelijk bewijs blijft expliciet onbevestigd. */ }
  }
  return { success: passed && report.fixture_cleanup === 'pass', report }
}

function privateFile(path) {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid() ||
    (stat.mode & 0o777) !== 0o600 || stat.size > 4096) fail()
}

function saveManifest(path, data, create = false) {
  if (!create) privateFile(path)
  const descriptor = openSync(path, create ? 'wx' : 'w', 0o600)
  try { writeFileSync(descriptor, JSON.stringify(data)); fsyncSync(descriptor) } finally { closeSync(descriptor) }
}

export function recoveryState(manifest, env) {
  validateInputs(manifest)
  const allowed = ['sha', 'run', 'nonce', 'parent', 'cleanupAttempted', 'cleanupVerified', 'lastStartedAt', 'phase']
  if (Object.keys(manifest).some(key => !allowed.includes(key)) ||
    manifest.sha !== env.EXPECTED_STAGING_SHA || manifest.run !== `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}` ||
    manifest.parent !== env.STORAGE_PARENT || typeof manifest.cleanupAttempted !== 'boolean' ||
    typeof manifest.cleanupVerified !== 'boolean' || !Number.isSafeInteger(manifest.lastStartedAt) ||
    manifest.lastStartedAt < 0 || manifest.lastStartedAt > Date.now() ||
    (manifest.phase !== undefined && !phases.includes(manifest.phase)) ||
    (manifest.cleanupAttempted && manifest.phase !== 'cleanup') ||
    (manifest.cleanupVerified && !manifest.cleanupAttempted)) fail()
  if (manifest.cleanupVerified) return 'verified'
  if (manifest.cleanupAttempted) return 'unverified'
  return 'attempt'
}

export async function main(env = process.env, mode = process.argv[2] ?? 'run') {
  const report = emptyReport()
  try {
    if (process.platform !== 'linux' || !['run', 'cleanup'].includes(mode) ||
      env.GITHUB_REF !== 'refs/heads/main' || env.CONFIRM_CLI_LOCK_DIAGNOSTICS !== 'true') fail()
    if (mode === 'cleanup' && env.EXECUTION_OUTCOME === 'skipped') return { success: true, report: { fixture_cleanup: 'not_tested' } }
    const directory = join(env.RUNNER_TEMP ?? '', 'staging-preflight')
    if (!env.RUNNER_TEMP || realpathSync(env.RUNNER_TEMP) !== env.RUNNER_TEMP) fail()
    if (existsSync(directory)) {
      const stat = lstatSync(directory)
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) fail()
      for (const file of ['key', 'known_hosts', 'config', 'lock-manifest.json']) {
        if (existsSync(join(directory, file))) privateFile(join(directory, file))
      }
    }
    const manifestPath = join(directory, 'lock-manifest.json')
    let manifest
    if (mode === 'run') {
      manifest = { sha: env.EXPECTED_STAGING_SHA, run: `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,
        nonce: randomBytes(16).toString('hex'), parent: env.STORAGE_PARENT, cleanupAttempted: false,
        cleanupVerified: false, lastStartedAt: 0 }
      validateInputs(manifest)
      configurePreflightSsh(env)
      saveManifest(manifestPath, manifest, true)
    } else {
      privateFile(manifestPath)
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const state = recoveryState(manifest, env)
      if (state === 'verified') return { success: true, report: { fixture_cleanup: 'pass' } }
      // Een reeds gestarte maar onbevestigde opruiming wordt niet automatisch herhaald.
      if (state === 'unverified') fail()
      configurePreflightSsh(env, 'cleanup')
    }
    const transport = createSshTransport(manifest, join(directory, 'config'))
    const record = change => { Object.assign(manifest, change); saveManifest(manifestPath, manifest) }
    if (mode === 'run') return await runLockDiagnostics({ transport, record })
    // Wacht conservatief vanaf herstelstart; een klokcorrectie mag deze wachttijd niet verkorten.
    if (manifest.phase !== undefined) await new Promise(resolveWait => setTimeout(resolveWait, 20000))
    record({ phase: 'cleanup', cleanupAttempted: true })
    const response = await transport.start('cleanup', 10000).completion
    if (!validateResponse(response, 'cleanup')) fail()
    record({ cleanupVerified: true })
    return { success: true, report: { fixture_cleanup: 'pass' } }
  } catch { return { success: false, report } }
}

export function formatReport(report) {
  const keys = Object.keys(emptyReport())
  if (!report || !Object.keys(report).length || Object.keys(report).some(key => !keys.includes(key)) ||
    Object.values(report).some(value => !['pass', 'fail', 'not_tested', 'unverified'].includes(value))) fail()
  return Object.entries(report).map(([key, value]) => `- \`${key}\`: \`${value}\``).join('\n') + '\n'
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await main()
  try {
    const formatted = formatReport(result.report)
    console.log(formatted.trimEnd())
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatted)
  } catch { result.success = false }
  if (!result.success) {
    console.error('CLI locking diagnostic or cleanup failed/unverified; owner follow-up is required. Private output is suppressed.')
    process.exitCode = 1
  }
}
