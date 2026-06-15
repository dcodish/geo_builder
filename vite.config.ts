/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { llmProxyPlugin } from './server/llmProxy';
import { logProxyPlugin } from './server/logProxy';

export default defineConfig({
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
    exclude: ['**/node_modules/**', '**/dist/**', 'archive/**'],
  },
});
