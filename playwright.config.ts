import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  // The cover is rendered on demand by `npm run cover` (playwright.cover.config.ts).
  testIgnore: 'cover.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    { command: 'npm run dev:mock', port: 9911, reuseExistingServer: !process.env.CI },
    { command: 'npm run preview', port: 4173, reuseExistingServer: !process.env.CI },
  ],
})
