import { readFileSync, appendFileSync } from 'node:fs'

const keys = new Set([
  'php_version', 'php_sapi', 'php_minimum', 'extension_curl', 'extension_pdo', 'extension_pdo_mysql',
  'function_flock', 'function_fsync', 'function_fflush', 'function_ftruncate', 'function_hrtime',
  'function_usleep', 'function_proc_open', 'function_proc_get_status', 'function_proc_terminate', 'function_posix_geteuid',
  'environment_load', 'OPEN_LIBRARY_PILOT_ENABLED', 'OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED',
  'OPEN_LIBRARY_STATE_FILE', 'OPEN_LIBRARY_USER_AGENT', 'RATE_LIMIT_SECRET',
  'configured_state_metadata', 'configured_state_schema', 'configured_state_location',
  'candidate_configured_parent', 'candidate_private', 'candidate_local_state',
  'fixture_cleanup', 'cli_flock_contention', 'cli_flock_after_release', 'cli_shared_visibility',
  'deployment_state_path_risk', 'web_runtime', 'web_configuration', 'web_worker_flock',
  'web_worker_storage_access', 'client_ip', 'multi_host_topology', 'cross_deployment_persistence', 'fatal',
])
const values = new Set([
  'pass', 'fail', 'present', 'absent', 'disabled', 'enabled', 'invalid', 'unverified', 'not_tested',
  'valid_syntax_only', 'valid_length_only', 'version_2', 'busy', 'unsafe', 'eligible_cli_only',
  'outside_declared_public_roots', 'inside_declared_public_roots', 'deployment_tree',
  'outside_declared_deployment_trees', 'requires_http_test', 'inspection_failed', 'cli',
])

try {
  const raw = readFileSync(process.argv[2])
  if (raw.length > 16384) throw new Error()
  const report = JSON.parse(raw.toString('utf8'))
  if (!report || Array.isArray(report) || typeof report !== 'object' || !Object.keys(report).length) throw new Error()
  for (const [key, value] of Object.entries(report)) {
    if (!keys.has(key) || typeof value !== 'string' ||
      !(key === 'php_version' ? /^\d{1,2}\.\d{1,2}\.\d{1,3}$/.test(value) : values.has(value))) throw new Error()
  }
  if (process.argv.includes('--require-cleanup') && report.fixture_cleanup !== 'pass') throw new Error()
  const lines = Object.entries(report).map(([key, value]) => `- \`${key}\`: \`${value}\``).join('\n')
  console.log(lines)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines}\n\n`)
  if (report.fatal || Object.values(report).includes('fail')) process.exitCode = 1
} catch {
  console.error('Diagnostic output failed the strict safe-output allowlist; raw output is suppressed.')
  process.exitCode = 1
}
