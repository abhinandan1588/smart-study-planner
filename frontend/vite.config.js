import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Flask API runs on its default port. Every frontend request goes to a
// relative `/api/v1/...` URL so the same code works behind a reverse proxy in
// production without an environment-specific base URL.
const FLASK_ORIGIN = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: FLASK_ORIGIN,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: FLASK_ORIGIN,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Recharts is only needed by the analytics / dashboard charts, so it
        // ships as its own chunk instead of inflating the main bundle.
        manualChunks: {
          recharts: ['recharts'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
