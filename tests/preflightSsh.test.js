import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { configurePreflightSsh } from '../scripts/diagnostics/configure-preflight-ssh.mjs'

const script = fileURLToPath(new URL('../scripts/diagnostics/configure-preflight-ssh.mjs', import.meta.url))
function fixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'mfl-pinned-ssh-'))
  const type = Buffer.from('ssh-ed25519')
  const blob = Buffer.alloc(4 + type.length + 4 + 32)
  blob.writeUInt32BE(type.length)
  type.copy(blob, 4)
  blob.writeUInt32BE(32, 4 + type.length)
  // Een synthetische testsleutel; nooit een echte hostidentiteit of credential.
  blob.fill(1, 4 + type.length + 4)
  const env = { RUNNER_TEMP: directory, STAGING_HOST: 'staging.example.invalid', STAGING_PORT: '65002',
    STAGING_USER: 'test_user', STAGING_SSH_KEY: 'CANARY_NOT_A_REAL_SECRET',
    STAGING_SSH_HOST_KEY: `ssh-ed25519 ${blob.toString('base64')}` }
  try { callback(env, join(directory, 'staging-preflight')) } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('preflight writes only the supplied host pin with strict verification and isolated trust sources', () => fixture((env, directory) => {
  assert.equal(configurePreflightSsh(env), true)
  const config = readFileSync(join(directory, 'config'), 'utf8')
  assert.equal(readFileSync(join(directory, 'known_hosts'), 'utf8'), `staging-preflight-pinned ${env.STAGING_SSH_HOST_KEY}\n`)
  for (const setting of ['HostKeyAlias staging-preflight-pinned', 'StrictHostKeyChecking yes',
    'GlobalKnownHostsFile /dev/null', 'KnownHostsCommand none', 'VerifyHostKeyDNS no', 'UpdateHostKeys no',
    'HostKeyAlgorithms ssh-ed25519', 'IdentityAgent none', 'BatchMode yes']) assert.ok(config.includes(setting))
  assert.doesNotMatch(config, /CANARY_NOT_A_REAL_SECRET/)
  if (process.platform !== 'win32') {
    assert.equal(statSync(directory).mode & 0o777, 0o700)
    for (const file of ['key', 'known_hosts', 'config']) assert.equal(statSync(join(directory, file)).mode & 0o777, 0o600)
  }
}))

test('missing or malformed pins and SSH config injection fail before writing usable configuration', () => fixture((env, directory) => {
  const cases = [
    { STAGING_SSH_HOST_KEY: '' }, { STAGING_SSH_HOST_KEY: 'ssh-ed25519 AAAA' },
    { STAGING_SSH_HOST_KEY: `${env.STAGING_SSH_HOST_KEY}\nssh-rsa AAAA` },
    { STAGING_SSH_HOST_KEY: env.STAGING_SSH_HOST_KEY.replace('ssh-ed25519 ', 'ssh-rsa ') },
    { STAGING_HOST: 'host\nProxyCommand invalid' }, { STAGING_USER: 'user\nProxyCommand invalid' },
    { STAGING_PORT: '0' }, { STAGING_PORT: '65536' }, { STAGING_SSH_KEY: '' },
  ]
  for (const overrides of cases) {
    assert.throws(() => configurePreflightSsh({ ...env, ...overrides }))
    assert.equal(existsSync(join(directory, 'config')), false)
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, ...env, ...overrides } })
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    for (const value of [env.STAGING_HOST, env.STAGING_USER, env.STAGING_SSH_KEY, env.STAGING_SSH_HOST_KEY]) {
      assert.ok(!result.stderr.includes(value))
    }
    assert.match(result.stderr, /connection blocked/)
  }
}))

test('supported RSA and ECDSA pins select only their corresponding host-key algorithms', () => fixture((env, directory) => {
  const encode = fields => Buffer.concat(fields.flatMap(field => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(field.length)
    return [length, field]
  })).toString('base64')
  for (const [algorithm, fields, expected] of [
    ['ssh-rsa', [Buffer.from([1, 0, 1]), Buffer.alloc(257, 1)], 'rsa-sha2-512,rsa-sha2-256'],
    ...[['nistp256', 65], ['nistp384', 97], ['nistp521', 133]].map(([curve, size]) =>
      [`ecdsa-sha2-${curve}`, [Buffer.from(curve), Buffer.concat([Buffer.from([4]), Buffer.alloc(size - 1, 1)])], `ecdsa-sha2-${curve}`]),
  ]) {
    const pin = `${algorithm} ${encode([Buffer.from(algorithm), ...fields])}`
    configurePreflightSsh({ ...env, STAGING_SSH_HOST_KEY: pin })
    assert.ok(readFileSync(join(directory, 'config'), 'utf8').includes(`  HostKeyAlgorithms ${expected}\n`))
    assert.equal(readFileSync(join(directory, 'known_hosts'), 'utf8'), `staging-preflight-pinned ${pin}\n`)
  }
}))

test('cleanup skips only an unstarted inspection and rebuilds missing SSH files for every other outcome', () => fixture((env, directory) => {
  assert.equal(configurePreflightSsh({ INSPECTION_OUTCOME: 'skipped' }, 'cleanup'), false)
  assert.equal(existsSync(directory), false)
  for (const outcome of ['success', 'failure', 'cancelled', '', undefined]) {
    rmSync(directory, { recursive: true, force: true })
    assert.equal(configurePreflightSsh({ ...env, INSPECTION_OUTCOME: outcome }, 'cleanup'), true)
    assert.ok(existsSync(join(directory, 'config')))
  }
  writeFileSync(join(directory, 'config'), 'partial configuration')
  rmSync(join(directory, 'known_hosts'))
  const recovered = spawnSync(process.execPath, [script, 'cleanup'], { encoding: 'utf8',
    env: { ...process.env, ...env, INSPECTION_OUTCOME: 'failure' } })
  assert.equal(recovered.status, 0)
  assert.equal(recovered.stdout.trim(), 'true')
  assert.equal(recovered.stderr, '')
  assert.match(readFileSync(join(directory, 'config'), 'utf8'), /StrictHostKeyChecking yes/)
  assert.equal(readFileSync(join(directory, 'known_hosts'), 'utf8'), `staging-preflight-pinned ${env.STAGING_SSH_HOST_KEY}\n`)
  const skipped = spawnSync(process.execPath, [script, 'cleanup'], { encoding: 'utf8',
    env: { ...process.env, ...env, INSPECTION_OUTCOME: 'skipped', STAGING_SSH_HOST_KEY: '' } })
  assert.equal(skipped.status, 0)
  assert.equal(skipped.stdout.trim(), 'false')
  const result = spawnSync(process.execPath, [script, 'cleanup'], { encoding: 'utf8',
    env: { ...process.env, ...env, INSPECTION_OUTCOME: 'failure', STAGING_SSH_HOST_KEY: '' } })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Cleanup is unverified.*Owner follow-up is required/)
  assert.doesNotMatch(result.stderr, /CANARY_NOT_A_REAL_SECRET/)
}))

test('workflow keeps manual gates, isolated raw-output handling and unconditional cleanup', () => {
  const workflow = readFileSync(new URL('../.github/workflows/staging-open-library-preflight.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(workflow, /ssh-keyscan|StrictHostKeyChecking no|set -x|upload-artifact/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main' && inputs.confirm_reviewed/)
  assert.match(workflow, /expected_staging_sha:\s+description:[^\n]+\s+type: string\s+required: true\s+test_disposable_flock:/)
  assert.match(workflow, /test_disposable_flock:[\s\S]*?default: false/)
  assert.match(workflow, /id: inspection/)
  assert.match(workflow, /Verify disposable-file cleanup\s+if: always\(\)/)
  assert.match(workflow, /INSPECTION_OUTCOME: \$\{\{ steps.inspection.outcome \}\}/)
  assert.match(workflow, /cleanup_needed=\$\(node scripts\/diagnostics\/configure-preflight-ssh.mjs cleanup\)/)
  assert.match(workflow, /cleanup.json" --require-cleanup/)
  assert.match(workflow, /2> "\$RUNNER_TEMP\/staging-preflight\/ssh-error"/)
  assert.match(workflow, /2> "\$RUNNER_TEMP\/staging-preflight\/cleanup-error"/)
  assert.match(workflow, /Remove runner credentials and private raw output\s+if: always\(\)/)
})
