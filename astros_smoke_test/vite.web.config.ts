import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Vite config for the cockpit SPA. Server (src/web/server.ts) imports this
// in dev mode via createViteServer({ middlewareMode: true }) and serves the
// built dist/web/ in prod mode.
export default defineConfig({
  root: fileURLToPath(new URL('./src/web/ui', import.meta.url)),
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('./dist/web', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    host: '127.0.0.1',
  },
});
