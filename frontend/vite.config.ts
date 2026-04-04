import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  server: {
    watch: {
      usePolling: true,
      interval: 150,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5040',
        changeOrigin: true,
      },
      '/_': {
        target: 'http://127.0.0.1:5040',
        changeOrigin: true,
      },
    },
  },
})
