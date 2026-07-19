// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * E2E Fundez (Playwright)
 *
 * Opciones:
 *   BASE_URL=https://www.fundez.cl npm run test:e2e   → contra entorno remoto
 *   E2E_START_SERVER=1 npm run test:e2e             → levanta node index.js (requiere MySQL)
 *   npm start  +  npm run test:e2e                  → reutiliza servidor local en :3000
 */
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const startServer = process.env.E2E_START_SERVER === '1';

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-CL'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: startServer
    ? {
        command: 'node index.js',
        url: 'http://127.0.0.1:3000/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
    : undefined
});
