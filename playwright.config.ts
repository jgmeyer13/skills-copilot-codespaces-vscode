import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

// This container ships a pinned Chromium at a fixed path and blocks the
// download, so it has to be pointed at explicitly. A GitHub runner installs its
// own via `playwright install`, where naming a path that does not exist fails
// before the first test — hence the check rather than a constant.
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
// `exactOptionalPropertyTypes` is on, so the key has to be absent rather than
// set to undefined.
const browser = existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {}

// Software WebGL: the CI container has no GPU, so Chromium falls back to SwiftShader.
const GL_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--disable-gpu-sandbox',
  '--no-sandbox',
  '--disable-dev-shm-usage',
]

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions: { ...browser, args: GL_ARGS },
  },
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
