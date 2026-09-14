import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Pages Functions run under `wrangler pages dev`; in plain `vite` mode
    // forward /api to it so the admin endpoints still work.
    proxy: { '/api': 'http://localhost:8788' },
  },
});
