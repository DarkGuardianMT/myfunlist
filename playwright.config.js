import { defineConfig } from '@playwright/test'

// Zichtbare browsers blijven ook bij onbedoelde CLI-opties geblokkeerd.
if (process.env.PWDEBUG && process.env.PWDEBUG !== '0' || process.argv.some(argument =>
  /^--(?:headed|debug|ui)(?:$|=|-)/.test(argument))) {
  throw new Error('UI tests support headless execution only; headed, debug and UI modes are disabled.')
}

export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/*.spec.js',
  outputDir: './test-results/ui',
  reporter: 'list',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  globalTimeout: 300000,
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: 'http://127.0.0.1:4179',
    serviceWorkers: 'block',
    acceptDownloads: false,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run test:ui:server',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
    timeout: 30000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
