import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'node:child_process';

// The same per-build release id as the siblings (git short-hash · build date), baked in as
// `__BUILD__` and shown in the shared frame's About modal — provenance for bug reports.
const BUILD_ID = (() => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
    return `${hash} · ${new Date().toISOString().slice(0, 10)}`;
  } catch {
    return 'dev';
  }
})();

// The analytic-geometry tool (docs/19) — the fourth sibling with its OWN production build:
// base `/analytic-builder/`, output `dist-analytic/`, entry `analytic.html` (renamed to index.html
// at deploy time, the ADR-3D-001 pattern). Dev needs no separate server: `npm run dev` serves
// /analytic.html alongside the other apps.
// Deliberately NO `@` alias (it maps to src/, the 2-D app) — the isolation rule (ADR-266,
// BOUNDARIES.json) makes a cross-product import fail the build instead of silently working.
// And deliberately NO `cacheDir` override (#593): a cache pinned outside the checkout is shared by
// every worktree, so two dev servers overwrite each other's optimized deps.
export default defineConfig({
  base: '/analytic-builder/',
  define: { __BUILD__: JSON.stringify(BUILD_ID) },
  plugins: [react()],
  build: {
    outDir: 'dist-analytic',
    rollupOptions: { input: path.resolve(__dirname, 'analytic.html') },
  },
});
