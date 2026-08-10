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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIERS = join(ROOT, 'reports', 'test-tiers.json');
const CATCHES = join(ROOT, 'reports', 'tier-catches.jsonl');
/**
 * WHICH FILES ARE "SLOW" — a RELATIVE rule (#484).
 *
 * This was an ABSOLUTE cutoff (60 s) applied to a MACHINE-DEPENDENT measurement, so the committed
 * membership flip-flopped with every PC switch: the faster machine put few files over 60 s, the slower
 * one many, each list correct for the machine that produced it and wrong for the other — spurious diffs
 * on a file no human reads, and a near-certain conflict on any branch touching it. It is the measurement
 * analogue of ADR-052's fixed-default smell: a value that looks like a constant but is really a free
 * variable of the environment.
 *
 * The rule is now scale-invariant, so both machines derive the SAME membership from their own timings:
 * the slow tier is the smallest set of the heaviest files that together account for `SLOW_SHARE` of the
 * suite's total file-time. That is exactly the intent the 60 s cutoff was chosen to approximate ("a
 * handful of files hold most of the compute, thousands hold ~1%") — stated as the property instead of as
 * one machine's wall-clock reading of it. Multiply every timing by any factor and the set is unchanged.
 *
 * `MIN_MEAN_MULT` guards the degenerate case: if the distribution is FLAT, no file is one of "the heavy
 * few", and accumulating to a share would sweep most of the suite into the slow tier. A file must also be
 * that many times the mean file duration to be eligible — likewise scale-invariant.
 */
const SLOW_SHARE = Number(process.env.SLOW_TEST_SHARE) || 0.75;
const MIN_MEAN_MULT = Number(process.env.SLOW_TEST_MEAN_MULT) || 3;

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
  // #484: membership is a SHARE of suite time, not a wall-clock cutoff, so the message reports the rule.
  // `thresholdMs` is the pre-#484 field — still read so an older tier file prints something sensible.
  const how = tiers.rule?.kind === 'top-share'
    ? `holding the heaviest ${Math.round(tiers.rule.share * 100)}% of suite time`
    : `measured > ${Math.round((tiers.thresholdMs ?? 60_000) / 1000)}s`;
  console.log(
    `test:fast — excluding ${tiers.slow.length} slow file(s) ${how} ` +
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

/**
 * The slow tier: the heaviest files that together hold `SLOW_SHARE` of total file-time, each at least
 * `MIN_MEAN_MULT`× the mean. Both conditions are ratios, so the result is invariant under a uniform
 * speed difference between machines (#484) — which is the whole point, and is asserted directly in
 * `server/__tests__/test-tiers.test.ts` (there, not here, because the shared-server tests run in EVERY
 * per-product lane and this script belongs to no product).
 * Exported for that test; it is a pure function of the timings and nothing else.
 */
export function classifySlow(files) {
  const total = files.reduce((t, f) => t + f.ms, 0);
  if (!total || !files.length) return [];
  const mean = total / files.length;
  const slow = [];
  let acc = 0;
  for (const f of [...files].sort((a, b) => b.ms - a.ms || (a.file < b.file ? -1 : 1))) {
    if (acc >= SLOW_SHARE * total) break; // the heavy few are already covered
    if (f.ms < MIN_MEAN_MULT * mean) break; // flat tail — nothing below this is "one of the heavy few"
    slow.push({ file: f.file, ms: Math.round(f.ms) });
    acc += f.ms;
  }
  return slow;
}

/** Rewrite reports/test-tiers.json only when the SET of slow files actually changed. */
function updateTiers(files) {
  const slow = classifySlow(files);

  const prev = readJson(TIERS, null);
  const prevSet = new Set((prev?.slow ?? []).map((s) => s.file));
  const nextSet = new Set(slow.map((s) => s.file));
  const added = [...nextSet].filter((f) => !prevSet.has(f));
  const removed = [...prevSet].filter((f) => !nextSet.has(f));

  // Membership unchanged AND the rule that produced it unchanged → leave the file alone (a routine green
  // run must not dirty the tree). The rule check matters on the run that CHANGES the rule: the membership
  // it yields may coincide with the old list, and the file would then still describe the old rule.
  const sameRule = prev?.rule?.kind === 'top-share' && prev.rule.share === SLOW_SHARE && prev.rule.minMeanMult === MIN_MEAN_MULT;
  if (!added.length && !removed.length && prev && sameRule) return;

  mkdirSync(dirname(TIERS), { recursive: true });
  writeFileSync(
    TIERS,
    `${JSON.stringify(
      {
        _comment:
          'MEASURED tier membership (ADR-394, rule relative since #484). Rewritten by `npm run test:full` ' +
          'only when the SET of slow files changes — the per-file `ms` are the writing machine\'s timings ' +
          'and are informational, so a faster or slower PC no longer produces a diff. `npm run test:fast` ' +
          'derives its --exclude list from `slow`.',
        rule: { kind: 'top-share', share: SLOW_SHARE, minMeanMult: MIN_MEAN_MULT },
        // informational only — what the relative rule happened to correspond to on THIS machine
        measuredCutoffMs: slow.length ? slow[slow.length - 1].ms : null,
        updatedAt: new Date().toISOString().slice(0, 10),
        slow,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\ntier membership updated (heaviest files holding ${Math.round(SLOW_SHARE * 100)}% of suite time):`);
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

// The CLI runs only when this file is EXECUTED, never when it is imported (#484: the tier rule is a pure
// function and its invariance is unit-tested, which requires importing the module without dispatching).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (mode === 'fast') fast();
  else if (mode === 'full') full();
  else if (mode === 'report') report();
  else {
    console.error('usage: node scripts/test-tiers.mjs <full|fast|report>');
    process.exit(2);
  }
}
