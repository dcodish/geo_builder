import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { execSync } from 'node:child_process';

// A per-build release id (git short-hash · build date), baked into the 3-D bundle as `__BUILD__` and
// stamped on every 3-D usage event so the /admin3 dashboard can filter outcomes by release (mirrors the
// 2-D `vite.config.ts`; the src3d isolation rule governs SOURCE imports, not this shared build metadata).
const BUILD_ID = (() => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
    return `${hash} · ${new Date().toISOString().slice(0, 10)}`;
  } catch {
    return 'dev';
  }
})();

// The 3-D space/vectors tool (docs/20) — a sibling app in this repo with its OWN
// production build: base `/3d-builder/`, output `dist-3d/`, entry `3d.html`.
// Deploy copies dist-3d/* to httpdocs/3d-builder/ with 3d.html renamed to index.html
// (rollup preserves the entry filename; the rename is a deploy-step concern — ADR-3D-001).
// Dev needs no separate server: the main `npm run dev` serves /3d.html alongside the 2-D app.
export default defineConfig({
  base: '/3d-builder/',
  define: { __BUILD__: JSON.stringify(BUILD_ID) },
  plugins: [react(), tailwindcss()],
  // Deliberately NO `@` alias here: `@/*` maps to src/ (the 2-D app), and the
  // isolation rule (docs/20 §12, ADR-266) forbids src3d importing 2-D code —
  // without the alias such an import fails the 3-D build instead of silently working.
  build: {
    outDir: 'dist-3d',
    rollupOptions: { input: path.resolve(__dirname, '3d.html') },
  },
  cacheDir: path.resolve(process.env.LOCALAPPDATA || '', 'vite-cache/geo-builder-3d'),
});
