#!/usr/bin/env node
/**
 * Two-tier test runner + unique-catch tracker (ADR-394, issue #344).
 *
 *   node scripts/test-tiers.mjs full   — run EVERYTHING, refresh the measured tier membership, and record
 *                                        any failure the FAST tier would have missed. The commit / deploy gate.
 *   node scripts/test-tiers.mjs fast   — run only the files measured as cheap. The development loop.
 *   node scripts/test-tiers.mjs report — print the longitudinal unique-catch record.
 *
 * WHY A MEASURED SPLIT, NOT A HAND-WRITTEN LIST: ADR-280 sharded the corpus and got the suite to ~3–4 min;
 * two weeks later it was 13 min again, because nothing noticed the new heavy tests. Tier membership is
 * therefore DERIVED from the last full run's timings — a newly-slow file joins the slow tier by itself.
 *
 * WHY TRACK CATCHES: the fast tier is a speed/coverage trade, and a trade should be evidenced rather than
 * assumed. When a full run fails and EVERY failure sits in a slow-only file, the fast tier would have been
 * green — that is a unique catch, appended to reports/tier-catches.jsonl with the test names. Over time
 * this says which slow files actually earn their cost, and which are only expensive.
 *
 * The tier file is rewritten ONLY when membership changes and the log is appended ONLY on a failure, so
 * neither dirties the tree on a routine green run.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIERS = join(ROOT, 'reports', 'test-tiers.json');
const CATCHES = join(ROOT, 'reports', 'tier-catches.jsonl');
/** A file costing more than this in a full run belongs to the slow tier. 60 s sits in a real gap in the
 *  measured distribution: 39 tests over it hold 73% of all compute, 5277 under 1 s hold 1%. */
const SLOW_MS = Number(process.env.SLOW_TEST_MS) || 60_000;

const rel = (p) => p.replace(/\\/g, '/').replace(`${ROOT.replace(/\\/g, '/')}/`, '');
const base = (p) => rel(p).split('/').pop();

const readJson = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
};

function runVitest(extraArgs) {
  const r = spawnSync('npx', ['vitest', 'run', ...extraArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return r.status ?? 1;
}

// ── fast ───────────────────────────────────────────────────────────────────
function fast() {
  const tiers = readJson(TIERS, null);
  if (!tiers?.slow?.length) {
    console.error(
      'test:fast — no measured tier membership yet (reports/test-tiers.json).\n' +
        'Running the FULL suite instead: a "fast" run with an unknown split would silently skip nothing,\n' +
        'or worse, pretend to be a tier. Run `npm run test:full` once to record timings.',
    );
    process.exit(runVitest([]));
  }
  const excludes = tiers.slow.flatMap((s) => ['--exclude', `**/${base(s.file)}`]);
  console.log(
    `test:fast — excluding ${tiers.slow.length} slow file(s) measured > ${Math.round(tiers.thresholdMs / 1000)}s ` +
      `(membership from ${tiers.updatedAt}).\nNOT a gate: run \`npm run test:full\` before committing or deploying.`,
  );
  process.exit(runVitest(excludes));
}

// ── full ───────────────────────────────────────────────────────────────────
function full() {
  const out = join(tmpdir(), `geo-suite-${process.pid}.json`);
  const status = runVitest(['--reporter=default', '--reporter=json', `--outputFile.json=${out}`]);
  const report = readJson(out, null);
  try {
    rmSync(out, { force: true });
  } catch {
    /* best effort */
  }
  if (!report?.testResults) {
    console.error('test:full — no JSON report produced; tier membership and catch tracking skipped.');
    process.exit(status);
  }

  const files = report.testResults.map((t) => ({
    file: rel(t.name),
    ms: t.endTime - t.startTime,
    failures: t.assertionResults.filter((a) => a.status === 'failed').map((a) => a.fullName),
  }));

  updateTiers(files);
  trackCatches(files);
  process.exit(status);
}

/** Rewrite reports/test-tiers.json only when the SET of slow files actually changed. */
function updateTiers(files) {
  const slow = files
    .filter((f) => f.ms > SLOW_MS)
    .sort((a, b) => b.ms - a.ms)
    .map((f) => ({ file: f.file, ms: Math.round(f.ms) }));

  const prev = readJson(TIERS, null);
  const prevSet = new Set((prev?.slow ?? []).map((s) => s.file));
  const nextSet = new Set(slow.map((s) => s.file));
  const added = [...nextSet].filter((f) => !prevSet.has(f));
  const removed = [...prevSet].filter((f) => !nextSet.has(f));

  if (!added.length && !removed.length && prev) return; // membership unchanged — leave the file alone

  mkdirSync(dirname(TIERS), { recursive: true });
  writeFileSync(
    TIERS,
    `${JSON.stringify(
      {
        _comment:
          'MEASURED tier membership (ADR-394). Rewritten by `npm run test:full` only when the set of slow ' +
          'files changes. `npm run test:fast` derives its --exclude list from `slow`.',
        thresholdMs: SLOW_MS,
        updatedAt: new Date().toISOString().slice(0, 10),
        slow,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\ntier membership updated (> ${SLOW_MS / 1000}s):`);
  for (const f of added) console.log(`  + ${f}`);
  for (const f of removed) console.log(`  - ${f}`);
  console.log('  commit reports/test-tiers.json so the fast tier matches on every machine.');
}

/** Append a record when the full run failed and the fast tier would NOT have. */
function trackCatches(files) {
  const failing = files.filter((f) => f.failures.length);
  if (!failing.length) return;

  const tiers = readJson(TIERS, null);
  const slowSet = new Set((tiers?.slow ?? []).map((s) => s.file));
  const inSlowOnly = failing.filter((f) => slowSet.has(f.file));
  const unique = inSlowOnly.length === failing.length; // nothing in the fast tier failed

  const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout?.trim() ?? '';
  const entry = {
    at: new Date().toISOString(),
    sha,
    unique,
    failingFiles: failing.map((f) => f.file),
    tests: failing.flatMap((f) => f.failures).slice(0, 20),
  };
  mkdirSync(dirname(CATCHES), { recursive: true });
  appendFileSync(CATCHES, `${JSON.stringify(entry)}\n`);

  console.log(
    unique
      ? `\n★ UNIQUE CATCH — every failure is in a slow-tier file; \`test:fast\` would have been GREEN.\n` +
          `  ${failing.map((f) => f.file).join(', ')}\n  recorded in reports/tier-catches.jsonl`
      : `\nfailure recorded (also visible to the fast tier) in reports/tier-catches.jsonl`,
  );
}

// ── report ─────────────────────────────────────────────────────────────────
function report() {
  if (!existsSync(CATCHES)) {
    console.log('No failures recorded yet — reports/tier-catches.jsonl does not exist.');
    return;
  }
  const rows = readFileSync(CATCHES, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const uniq = rows.filter((r) => r.unique);
  console.log(`Full-suite failures recorded: ${rows.length}`);
  console.log(`Unique to the slow tier:      ${uniq.length}  (the fast tier would have been green)\n`);
  const byFile = {};
  for (const r of uniq) for (const f of r.failingFiles) byFile[f] = (byFile[f] ?? 0) + 1;
  const ranked = Object.entries(byFile).sort((a, b) => b[1] - a[1]);
  if (ranked.length) {
    console.log('Slow files that have earned their cost:');
    for (const [f, n] of ranked) console.log(`  ${String(n).padStart(3)}×  ${f}`);
  }
  const tiers = readJson(TIERS, null);
  const never = (tiers?.slow ?? []).map((s) => s.file).filter((f) => !byFile[f]);
  if (never.length) {
    console.log('\nSlow files with no unique catch on record (candidates to speed up or fold in):');
    for (const f of never) console.log(`       ${f}`);
  }
}

const mode = process.argv[2];
if (mode === 'fast') fast();
else if (mode === 'full') full();
else if (mode === 'report') report();
else {
  console.error('usage: node scripts/test-tiers.mjs <full|fast|report>');
  process.exit(2);
}
