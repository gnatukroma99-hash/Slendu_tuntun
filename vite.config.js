import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/ws': { target: 'http://127.0.0.1:4180', ws: true },
      '/api': { target: 'http://127.0.0.1:4180' },
    },
  },
  preview: { host: '0.0.0.0' },
});
