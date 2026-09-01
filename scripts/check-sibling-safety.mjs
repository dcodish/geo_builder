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
 *   node scripts/check-sibling-safety.mjs                        # complex viewpoint, vs origin/main
 *   node scripts/check-sibling-safety.mjs --product 2d           # a 2-D slice: src3d/ + src-complex/ are the siblings
 *   node scripts/check-sibling-safety.mjs --base HEAD~1
 *   ALLOW_SIBLING_EDIT="why this legitimately edits a sibling" node scripts/check-sibling-safety.mjs
 *
 * `--product` (2d | 3d | complex, default complex) is the VIEWPOINT: which tree this change is allowed
 * to touch. Everything belonging to another product is a sibling, and the siblings' builds are the ones
 * that run. Before #846 the viewpoint was hard-coded, so only the complex lane could run this at all.
 *
 * Exit 0 = the siblings are provably untouched and still build. Exit 1 = look before you commit.
 *
 * The escape hatch is deliberately a REASON, not a flag: a cross-product change is legitimate (the
 * shared shell, a workspace-wide rename), and the thing worth forcing is that somebody said out loud
 * why. A bare `--force` would be typed reflexively; a sentence gets read back in review.
 */

import { execFileSync } from 'node:child_process';
import process from 'node:process';

/**
 * THE PRODUCT REGISTRY — every shipped product's own tree and the command that builds it (#846).
 *
 * This used to be two hand-written lists written from the COMPLEX product's point of view: `src/` and
 * `src3d/` were "sibling", `src-complex/` was "mine". That made the guard unrunnable from any other
 * lane — pointed at a 2-D branch it would have refused every legitimate `src/` edit as a sibling
 * violation — which is why `test-complex` was the only job that ran it, and why the sibling guarantee
 * (ADR-W-017) went unchecked for 2-D-only and 3-D-only PRs. The viewpoint is now a PARAMETER, so one
 * script serves every lane and adding product N+1 is one row here (docs/22 §9).
 */
export const PRODUCTS = {
  '2d': { prefixes: ['src/', 'index.html', 'vite.config.ts', 'fixtures/'], build: 'build' },
  '3d': { prefixes: ['src3d/', '3d.html', 'vite.config.3d.ts', 'fixtures3/'], build: 'build:3d' },
  complex: {
    prefixes: ['src-complex/', 'complex.html', 'vite.config.complex.ts', 'dist-complex/'],
    build: 'build:complex',
  },
};

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

const matches = (file, p) => (p.endsWith('/') ? file.startsWith(p) : file === p);
const startsWithAny = (file, prefixes) => prefixes.some((p) => matches(file, p));

/**
 * Which product owns `file`, or undefined. LONGEST prefix wins, so `src-complex/App.tsx` belongs to
 * `complex` and not to `2d` — the near-miss that makes a hand-written guard lie. This used to be held
 * by the ORDER of two `if`s ("order matters", said the comment); a structural longest-match cannot be
 * broken by someone reordering a list or adding product N+1 in the wrong place (#846).
 */
export function productOf(file) {
  let best;
  let bestLen = -1;
  for (const [id, { prefixes }] of Object.entries(PRODUCTS)) {
    for (const p of prefixes) {
      if (matches(file, p) && p.length > bestLen) {
        best = id;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/**
 * Pure classification of a changed-file list, from the point of view of the product being CHANGED —
 * exported so it is unit-tested rather than trusted.
 *
 * `own` is the tree this change is allowed to touch; `sibling` is any OTHER product's tree, and a file
 * there is the defect this guard exists to catch. Before #846 the viewpoint was hard-coded to
 * `complex`, so the guard could only ever run in one lane.
 */
export function classifyChange(files, product = 'complex') {
  if (!PRODUCTS[product]) {
    throw new Error(`unknown --product "${product}" — expected one of: ${Object.keys(PRODUCTS).join(', ')}`);
  }
  const own = [];
  const sibling = [];
  const shared = [];
  const inert = [];
  for (const f of files) {
    const file = f.replace(/\\/g, '/');
    const owner = productOf(file);
    if (owner === product) own.push(file);
    else if (owner) sibling.push(file);
    else if (startsWithAny(file, SHARED_PREFIXES)) shared.push(file);
    else if (startsWithAny(file, INERT_PREFIXES)) inert.push(file);
    // an unrecognised path is treated as SHARED: unknown-by-default must mean "check it",
    // never "assume it is safe" (the ci.yml classifier's rule, same reasoning)
    else shared.push(file);
  }
  return { own, sibling, shared, inert };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const hasCommit = (rev) => {
  try {
    git('rev-parse', '--verify', `${rev}^{commit}`);
    return true;
  } catch {
    return false;
  }
};

/**
 * The changed-file list vs `base` — or a LOUD failure (#846).
 *
 * The old fallback silently retargeted an unreachable base to `HEAD~1`. That answers a DIFFERENT
 * question than the one asked, and on a depth-1 CI clone `HEAD~1` does not exist either, so the
 * fallback that existed to make a fresh clone work was itself what crashed the lane — before any test
 * ran, on every shared-surface PR. A sibling check that silently compares the wrong range is worse
 * than one that stops: it reports PASS over a diff nobody asked about.
 *
 * So: try the base, then try to FETCH it (a shallow CI clone can deepen to a single commit — GitHub
 * serves an explicit sha), and otherwise fail with the reason and the fix. No silent retarget.
 */
function changedFiles(base) {
  const from = base;
  if (!hasCommit(from)) {
    try {
      git('fetch', '--depth=1', 'origin', from);
    } catch {
      /* fall through to the check below — the error message is the same either way */
    }
  }
  if (!hasCommit(from)) {
    throw new Error(
      `sibling-safety: base commit "${from}" is not reachable in this clone, and fetching it failed.\n` +
        `  Nothing was checked. This is almost always a SHALLOW CI checkout — give the job\n` +
        `      - uses: actions/checkout@v5\n` +
        `        with:\n` +
        `          fetch-depth: 0\n` +
        `  or pass a base that exists locally: --base <sha|ref>.`,
    );
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
  const prodIdx = argv.indexOf('--product');
  const product = prodIdx >= 0 ? argv[prodIdx + 1] : 'complex';
  const reason = process.env.ALLOW_SIBLING_EDIT?.trim();

  if (!PRODUCTS[product]) {
    console.error(`unknown --product "${product}" — expected one of: ${Object.keys(PRODUCTS).join(', ')}`);
    process.exit(2);
  }

  const files = changedFiles(base);
  const { own, sibling, shared, inert } = classifyChange(files, product);

  console.log(`sibling-safety [${product}] — ${files.length} changed file(s) vs ${base}`);
  console.log(`  own ${own.length} · shared ${shared.length} · inert ${inert.length} · sibling ${sibling.length}`);

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
        `\n  A slice scoped to ${product} must not edit another product's tree. If this change really\n` +
          `  is cross-product, say why and re-run:\n` +
          `      ALLOW_SIBLING_EDIT="the reason" node scripts/check-sibling-safety.mjs --product ${product}\n`,
      );
    }
  }

  // The builds run REGARDLESS of the diff: a shared-surface edit (tsconfig, package.json, the proxy)
  // can break a sibling without touching a single sibling file, which is the failure the diff check
  // cannot see. This is the half that costs seconds and is worth every one of them.
  console.log('\n  the siblings still build:');
  for (const [id, { build }] of Object.entries(PRODUCTS)) {
    if (id === product) continue; // building the tree you just changed proves nothing about a SIBLING
    ok = run(`${id.padEnd(7)} (npm run ${build})`, 'npm', ['run', build]) && ok;
  }

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
  try {
    main();
  } catch (e) {
    // "Fail loudly" means a READABLE refusal and a non-zero exit, not a stack trace: this runs in CI
    // where the last lines of the log are what someone actually reads (#846).
    console.error(`\n${e instanceof Error ? e.message : String(e)}`);
    console.error('\nsibling-safety: FAIL (nothing was checked)');
    process.exit(1);
  }
}
