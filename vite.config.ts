import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const BUILD_ID = new Date().toISOString().slice(0, 10).replace(/-/g, '')

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // One JS chunk keeps the artifact build (a single inlined HTML file) simple.
    rollupOptions: { output: { codeSplitting: false } },
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 1024 * 1024,
  },
  server: { port: 5173, host: '127.0.0.1' },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    reporters: ['default'],
    // Determinism tests run two engines for thousands of ticks on purpose; the
    // 5s default is not enough and a timeout there reads as a false divergence.
    testTimeout: 90_000,
  },
})
