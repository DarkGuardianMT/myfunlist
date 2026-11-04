import { request as httpsRequest } from 'node:https'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

export const flags = ['storage_access', 'distinct_processes', 'same_inode', 'concurrency_confirmed',
  'lock_contention', 'lock_release', 'shared_visibility', 'cleanup']
const empty = () => Object.fromEntries(flags.map(key => [key, false]))
const fail = () => { throw new Error('Web worker diagnostics unavailable; private details suppressed.') }

export function validateClient(config) {
  if (!config || config.owner_approved !== true || typeof config.url !== 'string') fail()
  const url = new URL(config.url)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    config.url !== url.origin + url.pathname || !/^\/[A-Za-z0-9_/.\-]{1,100}$/.test(url.pathname) ||
    url.pathname.includes('..') || url.pathname.includes('//') ||
    !/^[A-Za-z0-9_.-]{1,64}$/.test(config.basic_user ?? '') ||
    typeof config.basic_password !== 'string' || !/^[\x21-\x7e]{32,128}$/.test(config.basic_password) ||
    !/^[a-f0-9]{64}$/.test(config.request_key ?? '') || config.request_key === config.basic_password) fail()
  return url
}

export function validateResult(response) {
  if (!response || response.uncertain || ![200, 404, 503].includes(response.code) ||
    typeof response.body !== 'string' || Buffer.byteLength(response.body) > 1024) fail()
  const data = JSON.parse(response.body)
  if (!data || Object.keys(data).join(',') !== ['status', ...flags].join(',') ||
    !['pass', 'removed', 'denied', 'inconclusive'].includes(data.status) ||
    flags.some(key => typeof data[key] !== 'boolean') || JSON.stringify(data) + '\n' !== response.body ||
    (response.code === 200) !== ['pass', 'removed'].includes(data.status) ||
    (response.code === 404 && data.status !== 'denied') || (response.code === 503 && data.status !== 'inconclusive') ||
    (response.code !== 200 && flags.some(key => data[key]))) fail()
  return data
}

export function transport(config, request = httpsRequest) {
  const url = validateClient(config)
  return async (action, timeout) => new Promise(resolveResult => {
    let finished = false
    let req
    let timer
    let bytes = 0
    let body = ''
    const finish = response => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolveResult(response)
    }
    const abort = () => {
      if (finished) return
      finish({ uncertain: true, code: 0, body: '' })
      try { req?.destroy() } catch { /* Alleen het vaste onzekere resultaat teruggeven. */ }
    }
    try {
      if (!['attest', 'holder', 'ready', 'contender', 'visibility', 'cleanup'].includes(action)) fail()
      const payload = JSON.stringify({ action })
      req = request(url, { method: 'POST', agent: false, rejectUnauthorized: true, minVersion: 'TLSv1.2', headers: {
        Authorization: `Basic ${Buffer.from(`${config.basic_user}:${config.basic_password}`).toString('base64')}`,
        'X-MyFunList-Diagnostic-Key': config.request_key, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload), Accept: 'application/json', Connection: 'close',
      } }, response => {
        response.on('error', abort)
        response.on('aborted', abort)
        response.on('data', chunk => {
          bytes += chunk.length
          if (bytes > 1024) { body = ''; abort(); return }
          body += chunk.toString('utf8')
        })
        response.on('end', () => {
          if (!String(response.headers['cache-control'] ?? '').split(',').some(value => value.trim().toLowerCase() === 'no-store') ||
            response.headers['set-cookie'] || response.headers.location ||
            response.headers['content-type'] !== 'application/json') { abort(); return }
          finish({ uncertain: false, code: response.statusCode, body })
        })
      })
      timer = setTimeout(abort, Math.max(1, Math.min(5000, timeout)))
      req.on('error', abort)
      req.end(payload)
    } catch { abort() }
  })
}

export async function runPlan(send, { now = () => performance.now(), sleep = ms => new Promise(done => setTimeout(done, ms)) } = {}) {
  const started = now()
  let count = 0
  let uncertain = false
  let result = empty()
  const pending = []
  function begin(action) {
    const remaining = (action === 'cleanup' ? 60000 : 40000) - (now() - started)
    if (++count > 7 || remaining <= 0) fail()
    const call = Promise.resolve().then(() => send(action, Math.min(5000, remaining))).then(response => {
      if (response?.uncertain) uncertain = true
      return validateResult(response)
    }).catch(() => { uncertain = true; fail() })
    call.catch(() => {})
    pending.push(call)
    return call
  }
  let complete = false
  try {
    if ((await begin('attest')).status !== 'pass') fail()
    const holder = begin('holder')
    if ((await begin('ready')).status !== 'pass') fail()
    if ((await begin('contender')).status !== 'pass') fail()
    const held = await holder
    if (held.status !== 'pass' || !held.concurrency_confirmed || !held.distinct_processes || !held.same_inode || !held.lock_contention) fail()
    const visible = await begin('visibility')
    if (visible.status !== 'pass' || flags.filter(key => key !== 'cleanup').some(key => !visible[key])) fail()
    complete = true
  } catch { /* Geen herhaling of extra testrequests na een onzekere uitkomst. */ }
  finally {
    await Promise.allSettled(pending)
    const wait = uncertain ? 8000 : 0
    if (now() - started + wait <= 55000) {
      if (wait) await sleep(wait)
      try {
        const removed = await begin('cleanup')
        if (removed.cleanup) result = Object.fromEntries(flags.map(key => [key, removed[key]]))
        complete = complete && removed.status === 'pass' && flags.every(key => removed[key])
      } catch { complete = false }
    } else complete = false
  }
  return { status: complete && !uncertain ? 'pass' : 'inconclusive', ...result,
    cleanup: result.cleanup && !uncertain }
}

export async function main(env = process.env, argument = process.argv[2]) {
  try {
    if (argument !== '--execute-owner-approved' || process.platform !== 'linux' ||
      env.NODE_DEBUG || env.NODE_DEBUG_NATIVE || env.NODE_OPTIONS || env.SSLKEYLOGFILE || process.execArgv.length) fail()
    const path = env.MFL_WEB_DIAGNOSTIC_CLIENT_CONFIG
    if (!path || resolve(path) !== path || realpathSync(dirname(path)) !== dirname(path)) fail()
    const parent = lstatSync(dirname(path))
    const file = lstatSync(path)
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700 || parent.uid !== process.getuid() ||
      !file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.uid !== process.getuid() ||
      (file.mode & 0o777) !== 0o600 || file.size > 4096) fail()
    const config = JSON.parse(readFileSync(path, 'utf8'))
    return await runPlan(transport(config))
  } catch { return { status: 'inconclusive', ...empty() } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await main()
  console.log(JSON.stringify(result))
  if (result.status !== 'pass') process.exitCode = 1
}
