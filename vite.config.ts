import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Dev: Vite serves the app and forwards the API to the Fastify process.
  // Production: Fastify serves dist/ itself, so there is nothing to proxy.
  server: { proxy: { '/api': 'http://localhost:3001' } },
})
