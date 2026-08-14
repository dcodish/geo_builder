import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The complex-numbers tool (docs/27) — the fourth sibling with its OWN production build:
// base `/complex-builder/`, output `dist-complex/`, entry `complex.html` (renamed to index.html
// at deploy time, the ADR-3D-001 pattern). Dev needs no separate server: `npm run dev` serves
// /complex.html alongside the other apps.
// Deliberately NO `@` alias (it maps to src/, the 2-D app) — the isolation rule (ADR-266,
// BOUNDARIES.json) makes a cross-product import fail the build instead of silently working.
export default defineConfig({
  base: '/complex-builder/',
  plugins: [react()],
  build: {
    outDir: 'dist-complex',
    rollupOptions: { input: path.resolve(__dirname, 'complex.html') },
  },
  cacheDir: path.resolve(process.env.LOCALAPPDATA || '', 'vite-cache/geo-builder-complex'),
});
