import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    //vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  // Dev-only: the app uses a same-origin relative API base (`/api/...`); proxy
  // those calls to the backend so dev mirrors the prod nginx `/api/` proxy.
  // (WebSocket connects directly to `:5000` and needs no proxy here.)
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
