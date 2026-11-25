import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The browser app: one ES module, /app.js, which index.html loads.
 *
 * - The name is not hashed: the Node server serves a fixed list of file names from frontend/public.
 * - Output is plain static JavaScript with no eval and no inline script or style, so the strict
 *   Content-Security-Policy (script-src 'self'; style-src 'self') still holds.
 * - frontend/public is rebuilt from scratch: Vite empties it, then `npm run build` copies the static
 *   files (index.html, CSS, logo) in (scripts/sync-assets.mjs). No stale output can remain.
 */
export default defineConfig({
  root: here('.'),
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: here('public'),
    emptyOutDir: true,
    copyPublicDir: false,
    target: 'es2022',
    sourcemap: false,
    modulePreload: false,
    rolldownOptions: {
      input: { app: here('src/app/main.tsx') },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]'
      }
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts']
  }
});
