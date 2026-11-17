import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const expected = {
  disabled: ['404', 'not_found', 'false'],
  'tester-only': ['401', 'unauthenticated', 'true'],
  public: ['422', 'validation_error', 'true'],
}

export function verifyOpenLibraryConfiguration(mode, enabled) {
  if (!Object.hasOwn(expected, mode)) throw new Error('An explicit Open Library access mode is required.')
  if (!['true', 'false'].includes(enabled)) throw new Error('An explicit Open Library build flag is required.')
  if (enabled !== expected[mode][2]) throw new Error('Open Library access mode and build flag disagree.')
}

export function verifyOpenLibraryPilot(status, payload, mode, enabled) {
  verifyOpenLibraryConfiguration(mode, enabled)
  const [expectedStatus, expectedCode] = expected[mode]
  if (status !== expectedStatus || payload?.error?.code !== expectedCode) {
    throw new Error('Open Library does not match the expected staging access mode and build flag.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const payload = JSON.parse(readFileSync(process.argv[3], 'utf8'))
    verifyOpenLibraryPilot(process.argv[2], payload, process.env.OPEN_LIBRARY_EXPECTED_ACCESS_MODE, process.env.VITE_OPEN_LIBRARY_DISCOVER_ENABLED)
    console.log('Open Library matches the expected staging access mode and build flag.')
  } catch {
    console.error('Open Library staging verification failed; check the explicit access mode, build flag and pilot response.')
    process.exitCode = 1
  }
}
