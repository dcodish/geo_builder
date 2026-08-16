#!/usr/bin/env node
/**
 * SIBLING SAFETY — prove that a change to one product cannot have harmed the others.
 *
 * The operator's standing requirement for the complex-tool rebuild (2026-08-16): *"as we continue
 * evolving this complex tool we gain capability, but we never, never, never harm the other tools that
 * are running."* Two things already protect the siblings and neither is sufficient alone:
 *
 *   - `BOUNDARIES.json` + `server/__tests__/isolation.test.ts` forbid IMPORT coupling. That closes
 *     the edge `src-complex -> src`, but says nothing about a change that edits `src/` directly, or
 *     that breaks a sibling through a file both products share.
 *   - `npm run test:full` catches behavioural regressions — but only if it is run, and only after the
 *     work is already written.
 *
 * The hole between them is the one that actually bites: a slice "for the complex tool" quietly editing
 * a sibling file, or a shared-surface edit (tsconfig, package.json, the proxy) whose sibling fallout
 * nobody looked for. This script closes it in seconds rather than minutes, so it can run on every
 * commit instead of being skipped.
 *
 *   node scripts/check-sibling-safety.mjs            # vs origin/main
 *   node scripts/check-sibling-safety.mjs --base HEAD~1
 *   ALLOW_SIBLING_EDIT="why this legitimately edits a sibling" node scripts/check-sibling-safety.mjs
 *
 * Exit 0 = the siblings are provably untouched and still build. Exit 1 = look before you commit.
 *
 * The escape hatch is deliberately a REASON, not a flag: a cross-product change is legitimate (the
 * shared shell, a workspace-wide rename), and the thing worth forcing is that somebody said out loud
 * why. A bare `--force` would be typed reflexively; a sentence gets read back in review.
 */

import { execFileSync } from 'node:child_process';
import process from 'node:process';

/** Files that BELONG to a shipped sibling product. Editing one from a complex slice is the defect. */
const SIBLING_PREFIXES = [
  'src/',
  'src3d/',
  'index.html',
  '3d.html',
  'vite.config.ts',
  'vite.config.3d.ts',
  'fixtures/',
  'fixtures3/',
];

/** Files that belong to the complex product alone — a sibling cannot be reached through them. */
const COMPLEX_PREFIXES = ['src-complex/', 'complex.html', 'vite.config.complex.ts', 'dist-complex/'];

/** Changes here cannot be waved through: they are compiled or loaded by every product. */
const SHARED_PREFIXES = [
  'server/',
  'shell/',
  'scripts/',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
  'BOUNDARIES.json',
  '.github/',
];

/** Documentation and decision records — no product loads these. */
const INERT_PREFIXES = ['docs/', '.claude/', 'deploy/', 'reports/', 'README.md', 'CLAUDE.md', '.gitignore'];

const startsWithAny = (file, prefixes) =>
  prefixes.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p));

/**
 * Pure classification of a changed-file list — exported so it is unit-tested rather than trusted.
 * Order matters: `src-complex/` would otherwise match the `src/` sibling prefix, which is exactly the
 * kind of near-miss that makes a hand-written guard lie.
 */
export function classifyChange(files) {
  const sibling = [];
  const complex = [];
  const shared = [];
  const inert = [];
  for (const f of files) {
    const file = f.replace(/\\/g, '/');
    if (startsWithAny(file, COMPLEX_PREFIXES)) complex.push(file);
    else if (startsWithAny(file, SIBLING_PREFIXES)) sibling.push(file);
    else if (startsWithAny(file, SHARED_PREFIXES)) shared.push(file);
    else if (startsWithAny(file, INERT_PREFIXES)) inert.push(file);
    // an unrecognised path is treated as SHARED: unknown-by-default must mean "check it",
    // never "assume it is safe" (the ci.yml classifier's rule, same reasoning)
    else shared.push(file);
  }
  return { sibling, complex, shared, inert };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function changedFiles(base) {
  let from = base;
  try {
    git('rev-parse', '--verify', `${from}^{commit}`);
  } catch {
    from = 'HEAD~1'; // a fresh clone or a detached state still gets a useful answer
  }
  const committed = git('diff', '--name-only', `${from}...HEAD`).split('\n');
  const working = git('status', '--porcelain').split('\n').map((l) => l.slice(3));
  return [...new Set([...committed, ...working])].filter(Boolean);
}

function run(label, cmd, args) {
  process.stdout.write(`  ${label} … `);
  try {
    execFileSync(cmd, args, { stdio: 'pipe', shell: process.platform === 'win32' });
    console.log('ok');
    return true;
  } catch (e) {
    console.log('FAILED');
    console.error(String(e.stdout ?? '').slice(-4000));
    console.error(String(e.stderr ?? '').slice(-2000));
    return false;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const baseIdx = argv.indexOf('--base');
  const base = baseIdx >= 0 ? argv[baseIdx + 1] : 'origin/main';
  const reason = process.env.ALLOW_SIBLING_EDIT?.trim();

  const files = changedFiles(base);
  const { sibling, complex, shared, inert } = classifyChange(files);

  console.log(`sibling-safety — ${files.length} changed file(s) vs ${base}`);
  console.log(`  complex ${complex.length} · shared ${shared.length} · inert ${inert.length} · sibling ${sibling.length}`);

  let ok = true;

  if (sibling.length > 0) {
    if (reason) {
      console.log(`\n  ALLOW_SIBLING_EDIT set — permitted, and recorded:\n    "${reason}"`);
      for (const f of sibling) console.log(`      ${f}`);
    } else {
      ok = false;
      console.error(
        `\n  REFUSED: ${sibling.length} file(s) belonging to a shipped sibling product were changed:`,
      );
      for (const f of sibling) console.error(`      ${f}`);
      console.error(
        `\n  A slice scoped to one product must not edit another's tree. If this change really is\n` +
          `  cross-product, say why and re-run:\n` +
          `      ALLOW_SIBLING_EDIT="the reason" node scripts/check-sibling-safety.mjs\n`,
      );
    }
  }

  // The builds run REGARDLESS of the diff: a shared-surface edit (tsconfig, package.json, the proxy)
  // can break a sibling without touching a single sibling file, which is the failure the diff check
  // cannot see. This is the half that costs seconds and is worth every one of them.
  console.log('\n  the siblings still build:');
  ok = run('2-D  (npm run build)', 'npm', ['run', 'build']) && ok;
  ok = run('3-D  (npm run build:3d)', 'npm', ['run', 'build:3d']) && ok;

  if (shared.length > 0) {
    console.log(
      `\n  NOTE: ${shared.length} shared-surface file(s) changed — the builds above prove they still\n` +
        `  compile, but only "npm run test:full" proves the siblings still BEHAVE. Run it before committing.`,
    );
  }

  console.log(ok ? '\nsibling-safety: PASS' : '\nsibling-safety: FAIL');
  process.exit(ok ? 0 : 1);
}

// Importable for its unit test without running the CLI (the test-tiers.mjs precedent).
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('check-sibling-safety.mjs')) {
  main();
}
