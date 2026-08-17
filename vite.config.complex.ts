import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'node:child_process';

// The same per-build release id as the siblings (git short-hash · build date), baked in as
// `__BUILD__` and shown in the shared frame's About modal — provenance for bug reports. The root
// vite.config.ts defines it for the dev server; this production config was the one build missing
// it (an ADR-W-016 "implemented-or-forgotten" surface, closed by #673).
const BUILD_ID = (() => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
    return `${hash} · ${new Date().toISOString().slice(0, 10)}`;
  } catch {
    return 'dev';
  }
})();

// The complex-numbers tool (docs/27) — the fourth sibling with its OWN production build:
// base `/complex-builder/`, output `dist-complex/`, entry `complex.html` (renamed to index.html
// at deploy time, the ADR-3D-001 pattern). Dev needs no separate server: `npm run dev` serves
// /complex.html alongside the other apps.
// Deliberately NO `@` alias (it maps to src/, the 2-D app) — the isolation rule (ADR-266,
// BOUNDARIES.json) makes a cross-product import fail the build instead of silently working.
export default defineConfig({
  base: '/complex-builder/',
  define: { __BUILD__: JSON.stringify(BUILD_ID) },
  plugins: [react()],
  build: {
    outDir: 'dist-complex',
    rollupOptions: { input: path.resolve(__dirname, 'complex.html') },
  },
  // #593: NO `cacheDir` override. This branch was cut before that fix and carried one, copying the
  // sibling configs' fixed absolute path — the very thing #593 removed from both of them. A cache
  // pinned outside the checkout is shared by every worktree, so two dev servers (the normal state when
  // playing a PR) overwrite each other's optimized deps and the browser boots on stale `?v=` hashes.
  // Vite's default `node_modules/.vite` is per-checkout, which is exactly the property needed.
});
