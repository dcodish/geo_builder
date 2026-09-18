/**
 * Bundle the production LLM proxy into one self-contained file.
 *
 * Output: `dist-server/proxy.mjs` — the Anthropic SDK and the shared handler all
 * bundled in, so the deploy artifact is a single file that needs only Node + the
 * `ANTHROPIC_API_KEY` env var (no `npm install` on the server). Run via
 * `npm run build:proxy`.
 *
 * The options are EXPORTED (#1130) so that the deploy preflight and its lock ask this file what goes
 * into the bundle instead of describing it a second time. The RUNBOOK's old rule — *"did `server/`
 * change?"* — was a description of this build that had drifted from it, and the drift shipped stale
 * server code twice.
 */

import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '..');

/** Exactly what `npm run build:proxy` builds — one definition, three readers. */
export function proxyBuildOptions(root = repoRoot) {
  return {
    entryPoints: [resolve(root, 'server', 'standalone.ts')],
    outfile: resolve(root, 'dist-server', 'proxy.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    // `@/` resolves to src/ — matches the app's alias, in case a bundled module uses it.
    alias: { '@': resolve(root, 'src') },
    banner: { js: '// geo-builder LLM proxy — generated bundle, do not edit by hand.' },
  };
}

/** The first-party modules that actually end up in the bundle, per esbuild itself. */
export async function proxyInputs(root = repoRoot) {
  const result = await build({ ...proxyBuildOptions(root), write: false, metafile: true, logLevel: 'silent' });
  return Object.keys(result.metafile.inputs)
    .filter((p) => !p.includes('node_modules'))
    .map((p) => p.replace(/\\/g, '/'));
}

// Only build when RUN, not when imported — the preflight's lock imports this file.
if (process.argv[1] && resolve(process.argv[1]) === resolve(here, 'build.mjs')) {
  await build({ ...proxyBuildOptions(), logLevel: 'info' });
  console.log('built dist-server/proxy.mjs');
}
