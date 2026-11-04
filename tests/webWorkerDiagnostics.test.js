import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { flags, main, runPlan, transport, validateClient, validateResult } from '../diagnostics/web-worker/runner.mjs'

const helper = fileURLToPath(new URL('./support/web-worker-policy.php', import.meta.url))
const hash = value => createHash('sha256').update(value).digest('hex')
const now = 1800000000
const key = 'b'.repeat(64)
const nonce = 'd'.repeat(64)
const protections = ['basic_missing_denied', 'basic_wrong_denied', 'unauthenticated_php_not_reached',
  'same_staging_pool', 'server_wall_timeout', 'redacted_logging']
const body = '{"action":"attest"}'
const config = { version: 1, owner_approved: true, armed: true, issued_at: now - 1, expires_at: now + 899,
  expected_sapi: 'fpm-fcgi', endpoint_path: '/temporary-worker-diagnostic', basic_user_hash: hash('fixture_user'),
  boundary_secret: 'a'.repeat(64), request_key_hash: hash(key), run_nonce: nonce,
  package_hash: 'f'.repeat(64),
  fixture_parent: '/synthetic/private', excluded_roots: ['/synthetic/public','/synthetic/checkout'],
  verified: Object.fromEntries(protections.map(name => [name, true])) }
const server = { REQUEST_METHOD: 'POST', HTTPS: 'on', QUERY_STRING: '', REQUEST_URI: config.endpoint_path,
  CONTENT_TYPE: 'application/json', CONTENT_LENGTH: String(body.length), AUTH_TYPE: 'Basic', REMOTE_USER: 'fixture_user',
  MFL_WEB_DIAGNOSTIC_BOUNDARY: config.boundary_secret, HTTP_X_MYFUNLIST_DIAGNOSTIC_KEY: key }

function php(input) {
  const execution = spawnSync('php', ['-d','display_errors=0','-d','log_errors=0',helper],
    { input: JSON.stringify(input), encoding: 'utf8', timeout: 10000 })
  assert.equal(execution.status, 0)
  assert.equal(execution.stderr, '')
  assert.doesNotMatch(execution.stdout, /PRIVATE_CANARY|Warning:|Exception/)
  return JSON.parse(execution.stdout)
}
const authorize = change => php({ operation: 'authorize', config, server, body, sapi: 'fpm-fcgi', now, ...change })

test('pure authorization accepts only the complete verified boundary and independent key, with no fixture I/O', () => {
  assert.deepEqual(authorize({}), { accepted: true, action: 'attest' })
})

for (const [name, value] of Object.entries({ REQUEST_METHOD: 'GET', HTTPS: 'off', QUERY_STRING: 'key=PRIVATE_CANARY',
  REQUEST_URI: '/temporary-worker-diagnostic?key=PRIVATE_CANARY', PATH_INFO: '/extra', HTTP_COOKIE: 'PRIVATE_CANARY',
  HTTP_ORIGIN: 'https://outside.example.invalid', CONTENT_TYPE: 'text/plain', CONTENT_LENGTH: '999',
  AUTH_TYPE: 'Digest', REMOTE_USER: 'other_user', MFL_WEB_DIAGNOSTIC_BOUNDARY: 'c'.repeat(64),
  HTTP_X_MYFUNLIST_DIAGNOSTIC_KEY: 'c'.repeat(64), HTTP_TRANSFER_ENCODING: 'chunked', HTTP_CONTENT_ENCODING: 'gzip' })) {
  test(`security gate rejects ${name} without exposing input`, () => {
    assert.equal(authorize({ server: { ...server, [name]: value } }).accepted, false)
  })
}

test('PHP-parsed Basic credentials and spoofed forwarded/server headers never establish server protection', () => {
  for (const removed of ['AUTH_TYPE','REMOTE_USER','MFL_WEB_DIAGNOSTIC_BOUNDARY','HTTPS','HTTP_X_MYFUNLIST_DIAGNOSTIC_KEY']) {
    const attempted = { ...server, PHP_AUTH_USER: 'fixture_user', PHP_AUTH_PW: 'PRIVATE_CANARY',
      HTTP_AUTHORIZATION: 'Basic PRIVATE_CANARY', HTTP_REMOTE_USER: 'fixture_user',
      HTTP_MFL_WEB_DIAGNOSTIC_BOUNDARY: config.boundary_secret, HTTP_X_FORWARDED_PROTO: 'https' }
    delete attempted[removed]
    assert.equal(authorize({ server: attempted }).accepted, false)
  }
})

test('missing protection proof, approval, lifetime, runtime or distinct secrets keeps the endpoint disarmed', () => {
  for (const proof of protections) {
    assert.equal(authorize({ config: { ...config, verified: { ...config.verified, [proof]: false } } }).accepted, false)
  }
  for (const change of [{ owner_approved: false }, { armed: false }, { issued_at: now + 1 }, { expires_at: now },
    { expires_at: now + 900 }, { request_key_hash: hash(config.boundary_secret) }, { boundary_secret: '' },
    { run_nonce: '../PRIVATE_CANARY' }, { endpoint_path: '/../other' }]) {
    assert.equal(authorize({ config: { ...config, ...change } }).accepted, false)
  }
  assert.equal(authorize({ sapi: 'cli' }).accepted, false)
  assert.equal(authorize({ sapi: 'cgi-fcgi' }).accepted, false)
  assert.equal(php({ operation: 'template' }).accepted, false)
})

test('body rejects paths, extra keys, duplicate keys, malformed JSON and excessive input', () => {
  for (const malformed of ['{}', '{', '{"action":"prepare"}', '{"action":"attest","path":"PRIVATE_CANARY"}',
    '{"action":"cleanup","action":"attest"}', '{ "action": "attest" }', 'x'.repeat(129)]) {
    assert.equal(authorize({ body: malformed, server: { ...server, CONTENT_LENGTH: String(malformed.length) } }).accepted, false)
  }
})

test('private configuration is bounded JSON data and never executes PHP or reflects its contents', () => {
  assert.equal(php({ operation: 'decode', raw: JSON.stringify(config) }).accepted, true)
  for (const raw of ['<?php echo "PRIVATE_CANARY";', '{invalid', '[]', 'x'.repeat(8193)]) {
    assert.equal(php({ operation: 'decode', raw }).accepted, false)
  }
})

test('protocol disallows sequential/replayed or out-of-order requests and reserves cleanup after failure/budget', () => {
  const claim = claims => php({ operation: 'claim', nonce, claims })
  const first = [{ action: 'attest', now: 1 }]
  assert.equal(claim([...first, { action: 'holder', now: 2 }, { action: 'ready', now: 3 },
    { action: 'contender', now: 4 }]).accepted, true)
  for (const action of ['contender','visibility']) assert.equal(claim([...first, { action, now: 2 }]).accepted, false)
  const earlyReady = claim([...first, { action: 'ready', now: 2 }, { action: 'holder', now: 3 }])
  assert.equal(earlyReady.accepted, true)
  assert.equal(earlyReady.state.flags.concurrency_confirmed, false)
  assert.equal(claim([...first, { action: 'attest', now: 2 }]).accepted, false)
  assert.equal(claim([...first, { action: 'holder', now: 60000000002 }]).accepted, false)
  assert.equal(claim([...first, { action: 'cleanup', now: 60000000002 }]).accepted, true)
  const state = claim(first).state
  for (const changed of [{ stage: 'failed' }, { stage: 'released' }, { count: 6 }]) {
    const blocked = { ...state, ...changed }
    assert.equal(php({ operation: 'claim', nonce, state: blocked, claims: [{ action: 'contender', now: 2 }] }).accepted, false)
    assert.equal(php({ operation: 'claim', nonce, state: blocked, claims: [{ action: 'cleanup', now: 2 }] }).accepted, true)
  }
  assert.equal(php({ operation: 'claim', nonce, state: { ...state, count: 7 },
    claims: [{ action: 'cleanup', now: 2 }] }).accepted, false)
})

test('cross-worker evidence requires distinct real identities, exact inode and run nonce', () => {
  const file = { dev: 1, ino: 2 }
  const holder = { pid: 10, file, nonce }
  const peer = { pid: 11, file, nonce }
  const overlap = changed => php({ operation: 'overlap', holder, peer, file, nonce, ...changed }).value
  assert.equal(overlap({}), true)
  assert.equal(overlap({ peer: holder }), false)
  assert.equal(overlap({ peer: { ...peer, file: { dev: 1, ino: 3 } } }), false)
  assert.equal(overlap({ peer: { ...peer, nonce: 'e'.repeat(64) } }), false)
  assert.equal(overlap({ peer: { ...peer, pid: '11' } }), false)
})

test('output is a fixed boolean/status schema with no cookies, authentication challenge or cacheable headers', () => {
  const result = php({ operation: 'format', status: 'pass', flags: {} }).value
  assert.deepEqual(Object.keys(result), ['status', ...flags])
  for (const bad of [{ unexpected: 'PRIVATE_CANARY' }, { cleanup: 'pass' }, { cleanup: null }]) {
    assert.equal(php({ operation: 'format', status: 'pass', flags: bad }).accepted, false)
  }
  const headers = php({ operation: 'headers' }).value
  assert.match(headers['Cache-Control'], /no-store/)
  assert.equal(headers['Content-Type'], 'application/json')
  assert.ok(!Object.keys(headers).some(name => /set-cookie|location|www-authenticate|access-control/i.test(name)))
})

const client = { owner_approved: true, url: 'https://staging.example.invalid/temporary-worker-diagnostic',
  basic_user: 'fixture_user', basic_password: 'synthetic-password-'.repeat(3), request_key: key }
const response = (action, status = 'pass', extra = {}) => ({ code: 200, uncertain: false,
  body: JSON.stringify({ status, ...Object.fromEntries(flags.map(name => [name,
    status === 'pass' && (action === 'cleanup' || (['holder','visibility'].includes(action) && name !== 'cleanup'))])) }) + '\n', ...extra })

function scripted(failure, mutate = value => value) {
  const calls = []
  let finishHolder
  const holder = new Promise(done => { finishHolder = done })
  const send = (action, timeout) => {
    calls.push({ action, timeout })
    if (action === 'contender' || (action === 'ready' && failure === 'ready')) finishHolder()
    const value = mutate(action === failure ? response(action, 'inconclusive', { code: 503 }) : response(action), action)
    return action === 'holder' ? holder.then(() => value) : Promise.resolve(value)
  }
  return { send, calls }
}

test('client plan confirms overlap, joins workers and verifies final cleanup with six POSTs and no retry', async () => {
  const { send, calls } = scripted()
  const result = await runPlan(send)
  assert.equal(result.status, 'pass')
  assert.deepEqual(calls.map(value => value.action), ['attest','holder','ready','contender','visibility','cleanup'])
  assert.ok(calls.every(value => value.timeout > 0 && value.timeout <= 5000))
  assert.ok(flags.every(name => result[name] === true))
})

test('client failure or sequential false proof never passes, and cleanup is still attempted once', async () => {
  for (const failed of ['attest','holder','ready','contender','visibility','cleanup']) {
    const { send, calls } = scripted(failed)
    const result = await runPlan(send)
    assert.equal(result.status, 'inconclusive')
    assert.equal(calls.at(-1).action, 'cleanup')
    assert.equal(calls.filter(value => value.action === failed).length, 1)
  }
  const { send } = scripted(null, (value, action) => {
    if (action === 'holder') {
      const data = JSON.parse(value.body); data.concurrency_confirmed = false
      return { ...value, body: JSON.stringify(data) + '\n' }
    }
    return value
  })
  assert.equal((await runPlan(send)).status, 'inconclusive')
})

test('client uncertainty, malformed output and redirects cannot establish cleanup or leak raw output', async () => {
  for (const bad of [{ uncertain: true }, { code: 302 }, { body: 'PRIVATE_CANARY' },
    { body: response('attest').body.replace('"status"', '"private"') }]) {
    const { send, calls } = scripted(null, (value, action) => action === 'attest' ? { ...value, ...bad } : value)
    const waits = []
    const result = await runPlan(send, { sleep: async ms => waits.push(ms) })
    assert.equal(result.status, 'inconclusive')
    assert.equal(result.cleanup, false)
    assert.deepEqual(calls.map(value => value.action), ['attest','cleanup'])
    assert.deepEqual(waits, [8000])
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_CANARY/)
  }
  assert.throws(() => validateResult({ ...response('attest'), body: '{"status":"pass","status":"denied"}\n' }))
})

test('client rejects positive evidence attached to an error response', () => {
  const bad = response('cleanup', 'pass', { code: 503 })
  assert.throws(() => validateResult(bad))
})

test('client monotonic budget stops new test requests and refuses cleanup outside its bounded window', async () => {
  for (const elapsed of [40001, 55001]) {
    let clock = 0
    const { send, calls } = scripted(null, (value, action) => {
      if (action === 'attest') clock = elapsed
      return value
    })
    const result = await runPlan(send, { now: () => clock })
    assert.equal(result.status, 'inconclusive')
    assert.deepEqual(calls.map(value => value.action), elapsed === 40001 ? ['attest','cleanup'] : ['attest'])
    assert.ok(calls.length <= 7)
  }
})

test('client refuses plaintext, URL credentials/query, reused secrets, missing approval and unsafe path', async () => {
  assert.equal(validateClient(client).protocol, 'https:')
  for (const url of ['http://staging.example.invalid/check', 'https://user:password@staging.example.invalid/check',
    client.url + '?token=PRIVATE_CANARY', client.url + '#PRIVATE_CANARY', client.url + '/%2e%2e/other']) {
    assert.throws(() => validateClient({ ...client, url }))
  }
  assert.throws(() => validateClient({ ...client, owner_approved: false }))
  assert.throws(() => validateClient({ ...client, basic_password: key }))
  assert.equal((await main({}, undefined)).status, 'inconclusive')
  assert.equal((await main({ NODE_DEBUG: 'https' }, '--execute-owner-approved')).status, 'inconclusive')
})

test('HTTPS transport uses fresh verified TLS connections and header-only credentials; never follows redirects', async () => {
  for (const scenario of ['pass','timeout','redirect','cookie','overflow','error','cache','close-error']) {
    const calls = []
    const send = transport(client, (url, options, receive) => {
      const req = new EventEmitter()
      req.destroy = () => { if (scenario === 'close-error') req.emit('error', new Error('PRIVATE_CANARY')) }
      req.end = payload => {
        calls.push({ url, options, payload })
        queueMicrotask(() => {
          if (['error','close-error'].includes(scenario)) { req.emit('error', new Error('PRIVATE_CANARY')); return }
          if (scenario === 'timeout') return
          const res = new PassThrough()
          res.statusCode = scenario === 'redirect' ? 302 : 200
          res.headers = { 'cache-control': 'no-store', 'content-type': 'application/json' }
          if (scenario === 'cache') res.headers['cache-control'] = 'no-store-fake'
          if (scenario === 'cookie') res.headers['set-cookie'] = ['PRIVATE_CANARY']
          receive(res)
          res.end(scenario === 'overflow' ? 'PRIVATE_CANARY'.repeat(200) : response('attest').body)
        })
      }
      return req
    })
    const result = await send('attest', 10)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.rejectUnauthorized, true)
    assert.equal(calls[0].options.agent, false)
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(calls[0].url.username, '')
    assert.equal(calls[0].url.search, '')
    assert.equal(calls[0].payload, body)
    assert.equal(calls[0].options.headers['X-MyFunList-Diagnostic-Key'], key)
    if (scenario === 'pass') assert.equal(validateResult(result).status, 'pass')
    else assert.throws(() => validateResult(result))
  }
})

test('package stays outside application routes, deployment uploads and startup scripts', () => {
  const deployment = readFileSync(new URL('../.github/workflows/deploy-staging.yml', import.meta.url), 'utf8')
  assert.match(deployment, /dist\//)
  assert.doesNotMatch(deployment, /web-worker|endpoint\.php/)
  const bootstrap = readFileSync(new URL('../backend/config/bootstrap.php', import.meta.url), 'utf8')
  assert.doesNotMatch(bootstrap, /WebDiagnostic|diagnostics\/web-worker/)
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts
  assert.ok(!Object.values(scripts).some(command => /web-worker/.test(command)))
  const entry = readFileSync(new URL('../diagnostics/web-worker/endpoint.php', import.meta.url), 'utf8')
  assert.ok(entry.indexOf('Policy::authorize') < entry.indexOf("file_get_contents('php://input'"))
  assert.ok(entry.indexOf('Policy::authorize') < entry.indexOf("'/Fixture.php'"))
  assert.doesNotMatch(entry, /session_start|bootstrap\.php|environment\.php|WWW-Authenticate|curl_|proc_open/)
})
