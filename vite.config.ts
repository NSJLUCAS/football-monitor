import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls: false } }),
    tailwindcss(),
    {
      name: 'football-monitor-license-notices',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source: readFileSync('LICENSE', 'utf8') })
        this.emitFile({
          type: 'asset',
          fileName: 'THIRD_PARTY_NOTICES.txt',
          source: readFileSync('THIRD_PARTY_NOTICES.md', 'utf8'),
        })
      },
    },
  ],
  base: '/',
  resolve: { alias: { '@': import.meta.dirname + '/src' } },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': { target: process.env.MONITOR_HUB || 'http://127.0.0.1:9911', changeOrigin: true, ws: true },
    },
  },
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:9911', ws: true } } },
  build: { target: 'es2022', chunkSizeWarningLimit: 500 },
})
