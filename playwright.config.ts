import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
const base = process.env.TEST_BASE_PATH || '';
const artifacts = process.env.TEST_ARTIFACT_DIR || '.local/browser';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(artifacts, 'report') }]],
  outputDir: path.join(artifacts, 'results'),
  use: {
    channel: process.env.TEST_BROWSER_CHANNEL || undefined,
    baseURL: `http://127.0.0.1:4173${base}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs --port 4173',
    url: `http://127.0.0.1:4173${base}/`,
    reuseExistingServer: false,
    timeout: 15000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
