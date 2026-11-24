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
 * - frontend/public is rebuilt from scratch: Vite empties it, then `npm run build` copies the
 *   legacy files in (scripts/sync-assets.mjs). No stale output from an earlier build can remain.
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
      // One entry per migrated screen, named after the legacy module it replaces.
      input: {
        guide: here('src/guide/guide-module.tsx'),
        intake: here('src/intake/intake-module.tsx'),
        impact: here('src/impact/impact-module.tsx'),
        drafting: here('src/drafting/drafting-module.tsx')
      },
      // Keep the factory exports (createGuideUI, ...) that the legacy shell imports.
      preserveEntrySignatures: 'exports-only',
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        // All React code, its libraries and the bundler runtime load from one shared.js, the only
        // extra name in the Node server's fixed asset list. Each screen file (guide.js, ...) is a
        // small module that re-exports its factory from shared.js, so React loads once.
        codeSplitting: { groups: [{ name: 'shared', test: /./ }] }
      }
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts']
  }
});
