/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { execSync } from 'node:child_process';
import { llmProxyPlugin } from './server/llmProxy';
import { logProxyPlugin } from './server/logProxy';

// A per-build release id (git short-hash · build date), baked into the bundle as `__BUILD__` and stamped
// on every usage event (ADR-146 analytics) so the admin dashboard can filter outcomes by release — i.e.
// see whether a fixed error type still recurs in traffic AFTER its deploy. Falls back to 'dev'.
const BUILD_ID = (() => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
    return `${hash} · ${new Date().toISOString().slice(0, 10)}`;
  } catch {
    return 'dev';
  }
})();

export default defineConfig(({ command }) => ({
  define: { __BUILD__: JSON.stringify(BUILD_ID) },
  // Production build is served from the `/geo-builder/` subpath on themathbible.com;
  // the dev server stays at root. `import.meta.env.BASE_URL` follows this, so the
  // client's `/api/parse` fetch resolves correctly under either base.
  base: command === 'build' ? '/geo-builder/' : '/',
  // llmProxyPlugin serves POST /api/parse in dev (Phase 7 LLM fallback); the
  // ANTHROPIC_API_KEY lives only in this Node process, never in the browser.
  // logProxyPlugin serves POST /api/log in dev → logs/debug-log.jsonl (debug aid).
  plugins: [react(), tailwindcss(), llmProxyPlugin(), logProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // The debug log (logs/debug-log.jsonl) is written constantly while the app runs;
  // exclude it from the dev watcher or every write triggers a reload → write loop.
  server: { watch: { ignored: ['**/logs/**'] } },
  cacheDir: path.resolve(process.env.LOCALAPPDATA || '', 'vite-cache/geo-builder'),
  test: {
    // archive/ holds the old implementation for reference only — never run or typecheck its tests.
    // _node_modules_dropbox_old/ is a parked copy of node_modules (Dropbox-cloud-managed; node_modules
    // now lives outside Dropbox via a junction) — exclude its stray third-party tests from collection.
    exclude: ['**/node_modules/**', '**/_node_modules_dropbox_old/**', '**/dist/**', 'archive/**'],
  },
}));
