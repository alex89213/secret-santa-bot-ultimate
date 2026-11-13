/**
 * Description:  Playwright settings for the browser test, which starts its own app on port 3001.
 * Author:       Alex Wu
 * Dependencies: @playwright/test, node:fs
 * Usage:        npm run test:e2e
 */
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: {
    command: process.env.E2E_PRODUCTION === '1' ? 'npm start' : 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    env: { PORT: '3001', APP_URL: 'http://localhost:3001', SSBU_E2E_SERVER: '1' },
    timeout: 120000,
  },
});
