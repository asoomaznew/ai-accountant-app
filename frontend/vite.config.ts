import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        fs: {
          strict: false
        },
        proxy: {
          // During Vite dev, route /api/* to the FastAPI backend so that
          // relative fetches (and CORS) work without a separate origin.
          '/api': {
            target: 'http://127.0.0.1:8000',
            changeOrigin: true,
          },
        },
      },
      plugins: [react(), tailwindcss()],

      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        // These packages ship pre-built ESM — Vite must NOT re-bundle them
        exclude: ['@mlc-ai/web-llm', '@xenova/transformers', 'mupdf'],
      },
      build: {
        target: 'esnext',
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
          output: {
            // Keep the app shell lean. These libraries are shared by several
            // lazy-loaded screens but do not need to delay the first render.
            manualChunks(id) {
              if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
                return 'react-vendor';
              }
              if (id.includes('node_modules/framer-motion/')) {
                return 'motion-vendor';
              }
              if (id.includes('node_modules/lucide-react/')) {
                return 'icons-vendor';
              }
              if (id.includes('node_modules/exceljs/')) {
                return 'exceljs-vendor';
              }
              if (id.includes('node_modules/pdfjs-dist/')) {
                return 'pdfjs-vendor';
              }
              if (id.includes('node_modules/jszip/')) {
                return 'jszip-vendor';
              }
            },
          },
        },
      },
      worker: {
        format: 'es', // Required for Comlink + WebLLM in workers
      }
    };
});
