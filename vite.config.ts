import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // satellite.js v7 kullanmadığımız bir WASM sürümünü de içe aktarıyor; onun
  // Worker'ı top-level await içeriyor ve varsayılan 'iife' biçimiyle derlenemiyor
  worker: { format: 'es' },
})
