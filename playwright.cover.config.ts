import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// `npm run cover` re-renders preview.png, the cover the Hub theme page shows. Needs a fresh `npm run build`.
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: 'cover.spec.ts',
  reporter: 'list',
})
