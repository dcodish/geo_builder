/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { llmProxyPlugin } from './server/llmProxy';

export default defineConfig({
  // llmProxyPlugin serves POST /api/parse in dev (Phase 7 LLM fallback); the
  // ANTHROPIC_API_KEY lives only in this Node process, never in the browser.
  plugins: [react(), tailwindcss(), llmProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  cacheDir: path.resolve(process.env.LOCALAPPDATA || '', 'vite-cache/geo-builder'),
  test: {
    // archive/ holds the old implementation for reference only — never run or typecheck its tests.
    exclude: ['**/node_modules/**', '**/dist/**', 'archive/**'],
  },
});
