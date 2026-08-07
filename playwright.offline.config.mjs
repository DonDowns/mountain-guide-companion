import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './tests',
  testMatch: ['offline*.spec.mjs'],
  timeout: 90000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { outputFolder: 'tmp/playwright/offline-report', open: 'never' }]] : 'line',
  outputDir: 'tmp/playwright/offline-results',
  use: {
    baseURL,
    locale: 'en-US',
    timezoneId: 'America/Denver',
    colorScheme: 'light',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'env OFFLINE_TEST_MODE=1 PORT=4174 npm run serve:pwa',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000
  },
  projects: [
    { name: 'offline-chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'offline-chromium-mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'offline-webkit-desktop', use: { browserName: 'webkit', viewport: { width: 1280, height: 900 } } },
    {
      name: 'offline-webkit-mobile',
      use: {
        browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
      }
    }
  ]
});
