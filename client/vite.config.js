import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/quiz-app/',
  server: {
    proxy: {
      // Same-origin API in dev (avoids "Failed to fetch" from localhost vs 127.0.0.1 / CORS edge cases)
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
})
