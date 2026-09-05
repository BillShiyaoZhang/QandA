import { defineConfig, devices } from '@playwright/test';
const base = process.env.TEST_BASE_PATH || '';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:4173${base}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node scripts/serve-dist.mjs --port 4173 ${process.env.TEST_DIST_DIR ? '--dir ' + process.env.TEST_DIST_DIR : ''}`,
    url: `http://127.0.0.1:4173${base}/`,
    reuseExistingServer: false,
    timeout: 15000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
