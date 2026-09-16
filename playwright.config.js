import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:4178', trace: 'retain-on-failure', launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } },
  webServer: { command: 'npm run dev -- --port 4178', url: 'http://127.0.0.1:4178', reuseExistingServer: true, timeout: 120000 },
  projects: [
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ]
});
