import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    launchOptions: {
      // HEADLESS_MESA=1 selects system Mesa/llvmpipe instead of bundled SwiftShader
      // on ARM Linux environments where SwiftShader cannot create a working GPU process.
      args: ['--no-sandbox', '--disable-gpu-sandbox', '--disable-gpu-watchdog', '--enable-unsafe-swiftshader', ...(process.env.HEADLESS_MESA ? ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] : [])],
      env: { ...process.env, ...(process.env.HEADLESS_MESA ? { LIBGL_ALWAYS_SOFTWARE: '1', EGL_PLATFORM: 'surfaceless' } : {}) },
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 640 } } },
    { name: 'android-landscape', use: { ...devices['Pixel 7 landscape'], defaultBrowserType: 'chromium' } },
    { name: 'android-portrait', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    { command: 'node server/index.js', env: { PORT: '4180', GAME_DIST: 'dist', PUBLIC_ORIGIN: '' }, url: 'http://127.0.0.1:4180/api/health', reuseExistingServer: !process.env.CI, timeout: 30_000 },
    { command: 'npm run dev -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 30_000 },
  ],
});
