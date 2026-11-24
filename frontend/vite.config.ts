import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * React screens replace legacy screens one at a time (strangler pattern). Each is built as a
 * fixed-name ES module with the same exports as the legacy module it replaces, so the legacy shell
 * (frontend/legacy/app.js) keeps importing it unchanged.
 *
 * - Names are not hashed: the Node server serves a fixed list of file names from frontend/public.
 * - Output is plain static JavaScript with no eval and no inline script or style, so the strict
 *   Content-Security-Policy (script-src 'self'; style-src 'self') still holds.
 * - frontend/public also holds the copied legacy files, so it is never emptied.
 */
export default defineConfig({
  root: here('.'),
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: here('public'),
    emptyOutDir: false,
    copyPublicDir: false,
    target: 'es2022',
    sourcemap: false,
    modulePreload: false,
    rolldownOptions: {
      // One entry per migrated screen, named after the legacy module it replaces.
      input: { guide: here('src/guide/guide-module.tsx') },
      // Keep the factory exports (createGuideUI) that the legacy shell imports.
      preserveEntrySignatures: 'exports-only',
      output: { entryFileNames: '[name].js', chunkFileNames: '[name].js', assetFileNames: '[name][extname]' }
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts']
  }
});
