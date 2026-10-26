import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls: false } })],
  resolve: { alias: { '@': import.meta.dirname + '/src' } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.{ts,js}'], restoreMocks: true },
})
