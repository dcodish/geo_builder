/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { llmProxyPlugin } from './server/llmProxy';
import { logProxyPlugin } from './server/logProxy';

export default defineConfig(({ command }) => ({
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
