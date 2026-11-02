import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function validHostKey(value) {
  if (typeof value !== 'string' || value.length > 16384) return false
  const match = /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)) ([A-Za-z0-9+/]+={0,2})$/.exec(value.trim())
  if (!match) return false
  const blob = Buffer.from(match[2], 'base64')
  if (blob.toString('base64') !== match[2]) return false
  let offset = 0
  const fields = []
  while (offset < blob.length) {
    if (offset + 4 > blob.length) return false
    const size = blob.readUInt32BE(offset)
    offset += 4
    if (!size || offset + size > blob.length) return false
    fields.push(blob.subarray(offset, offset + size))
    offset += size
  }
  if (fields[0]?.toString('utf8') !== match[1]) return false
  if (match[1] === 'ssh-ed25519') return fields.length === 2 && fields[1].length === 32
  if (match[1] === 'ssh-rsa') return fields.length === 3 && fields[2].length >= 256
  const curve = match[1].slice('ecdsa-sha2-'.length)
  const size = { nistp256: 65, nistp384: 97, nistp521: 133 }[curve]
  return fields.length === 3 && fields[1].toString('utf8') === curve && fields[2].length === size && fields[2][0] === 4
}

export function configurePreflightSsh(env, mode = 'configure') {
  if (!['configure', 'cleanup'].includes(mode)) throw new Error()
  // Alleen een overgeslagen inspectiestap sluit een externe fixture uit.
  if (mode === 'cleanup' && env.INSPECTION_OUTCOME === 'skipped') return false
  const { RUNNER_TEMP: runnerTemp, STAGING_HOST: host, STAGING_PORT: port,
    STAGING_USER: user, STAGING_SSH_KEY: key, STAGING_SSH_HOST_KEY: hostKey } = env
  if (!runnerTemp || !isAbsolute(runnerTemp) || /["\r\n\0]/.test(runnerTemp) ||
    !/^[A-Za-z0-9][A-Za-z0-9.:-]*$/.test(host ?? '') || host.length > 253 ||
    !/^\d{1,5}$/.test(port ?? '') || Number(port) < 1 || Number(port) > 65535 ||
    !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(user ?? '') ||
    typeof key !== 'string' || !key.trim() || key.length > 65536 || !validHostKey(hostKey)) throw new Error()

  const directory = join(runnerTemp, 'staging-preflight')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeFileSync(join(directory, 'key'), `${key.replaceAll('\r', '').trim()}\n`, { mode: 0o600 })
  writeFileSync(join(directory, 'known_hosts'), `staging-preflight-pinned ${hostKey.trim()}\n`, { mode: 0o600 })
  const config = [
    'Host staging', `  HostName ${host}`, `  Port ${port}`, `  User ${user}`,
    `  IdentityFile "${join(directory, 'key')}"`,
    `  UserKnownHostsFile "${join(directory, 'known_hosts')}"`,
    '  HostKeyAlias staging-preflight-pinned', '  GlobalKnownHostsFile /dev/null',
    '  KnownHostsCommand none', '  VerifyHostKeyDNS no', '  UpdateHostKeys no',
    `  HostKeyAlgorithms ${hostKey.trim().startsWith('ssh-rsa ') ? 'rsa-sha2-512,rsa-sha2-256' : hostKey.trim().split(' ')[0]}`,
    '  IdentitiesOnly yes', '  IdentityAgent none', '  BatchMode yes',
    '  StrictHostKeyChecking yes', '  ConnectTimeout 15',
    '  ServerAliveInterval 10', '  ServerAliveCountMax 2',
  ]
  // Schrijf de configuratie pas nadat alle verplichte bestanden beschikbaar zijn.
  writeFileSync(join(directory, 'config'), `${config.join('\n')}\n`, { mode: 0o600 })
  return true
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2] ?? 'configure'
  try {
    const needed = configurePreflightSsh(process.env, mode)
    if (mode === 'cleanup') console.log(String(needed))
  } catch {
    console.error(mode === 'cleanup'
      ? 'Cleanup is unverified: pinned SSH configuration could not be prepared. Owner follow-up is required; private details are suppressed.'
      : 'Pinned SSH configuration is missing, invalid or unavailable; connection blocked. Private details are suppressed.')
    process.exitCode = 1
  }
}
