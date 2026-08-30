import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), svgr()],
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      '@ds': resolve(import.meta.dirname, './src/design-system'),
      '@games/shared': resolve(import.meta.dirname, '../../packages/shared/src/index.ts'),
      '@games/game-engine/browser': resolve(import.meta.dirname, '../../packages/game-engine/src/browser.ts'),
      '@games/game-engine': resolve(import.meta.dirname, '../../packages/game-engine/src/browser.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
