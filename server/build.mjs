/**
 * Bundle the production LLM proxy into one self-contained file.
 *
 * Output: `dist-server/proxy.mjs` — the Anthropic SDK and the shared handler all
 * bundled in, so the deploy artifact is a single file that needs only Node + the
 * `ANTHROPIC_API_KEY` env var (no `npm install` on the server). Run via
 * `npm run build:proxy`.
 */

import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

await build({
  entryPoints: [resolve(here, 'standalone.ts')],
  outfile: resolve(root, 'dist-server', 'proxy.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // `@/` resolves to src/ — matches the app's alias, in case a bundled module uses it.
  alias: { '@': resolve(root, 'src') },
  banner: { js: '// geo-builder LLM proxy — generated bundle, do not edit by hand.' },
  logLevel: 'info',
});

console.log('built dist-server/proxy.mjs');
