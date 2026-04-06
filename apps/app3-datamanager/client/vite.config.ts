import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/app3/',
  server: {
    port: 5175,
    proxy: {
      '/api': { target: 'http://localhost:4002', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
