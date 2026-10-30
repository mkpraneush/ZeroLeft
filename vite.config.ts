import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/customer': 'http://127.0.0.1:8000',
      '/vendor': 'http://127.0.0.1:8000',
      '/products': 'http://127.0.0.1:8000',
      '/reservations': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/docs': 'http://127.0.0.1:8000',
      '/openapi.json': 'http://127.0.0.1:8000',
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
    },
  },
});
