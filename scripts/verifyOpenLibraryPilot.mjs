import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function verifyOpenLibraryPilot(status, payload, enabled) {
  if (!['true', 'false'].includes(enabled)) throw new Error('An explicit Open Library build flag is required.')
  const expectedStatus = enabled === 'true' ? '422' : '404'
  const expectedCode = enabled === 'true' ? 'validation_error' : 'not_found'
  if (status !== expectedStatus || payload?.error?.code !== expectedCode) {
    throw new Error('Open Library pilot does not match the expected staging build state.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const payload = JSON.parse(readFileSync(process.argv[3], 'utf8'))
    verifyOpenLibraryPilot(process.argv[2], payload, process.env.VITE_OPEN_LIBRARY_DISCOVER_ENABLED)
    console.log('Open Library pilot matches the expected staging build state.')
  } catch {
    console.error('Open Library staging verification failed; check the explicit build flag and pilot response.')
    process.exitCode = 1
  }
}
