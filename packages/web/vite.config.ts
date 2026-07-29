import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/rt': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      // Blob bytes. Mounted only when `STORAGE_PROVIDER=local-disk`, and no
      // rewrite — the server serves this path verbatim.
      //
      // **Without this, browser uploads fail in dev**, and they failed silently
      // from 0.7.4 until 2E found it: `GET`ting a blob is an `<img src>`, which
      // is not CORS-gated, so reads always worked — but `uploadBlob` PUTs with
      // `fetch`, which preflights, and `CORS_ALLOWED_ORIGINS` is deliberately
      // unset in dev because the proxy is supposed to make everything
      // same-origin. It did, for `/api` and `/rt`, and not for the one path
      // that carries bytes. Pairs with a relative `BLOB_PUBLIC_BASE_URL`.
      '/blobs': {
        target: 'http://localhost:3001',
      },
    },
  },
})
