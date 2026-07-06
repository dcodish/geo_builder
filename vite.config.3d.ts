import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// The 3-D space/vectors tool (docs/20) — a sibling app in this repo with its OWN
// production build: base `/3d-builder/`, output `dist-3d/`, entry `3d.html`.
// Deploy copies dist-3d/* to httpdocs/3d-builder/ with 3d.html renamed to index.html
// (rollup preserves the entry filename; the rename is a deploy-step concern — ADR-3D-001).
// Dev needs no separate server: the main `npm run dev` serves /3d.html alongside the 2-D app.
export default defineConfig({
  base: '/3d-builder/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-3d',
    rollupOptions: { input: path.resolve(__dirname, '3d.html') },
  },
  cacheDir: path.resolve(process.env.LOCALAPPDATA || '', 'vite-cache/geo-builder-3d'),
});
