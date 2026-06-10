/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
