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
 *
 * WHY A VERDICT ARTIFACT (#750): "is the suite green?" could not be asked mechanically. The exit status is
 * and always was honest — it is destroyed at the CALL SITE, because a POSIX pipeline reports its LAST
 * command's status, so the ubiquitous `npm run test:full 2>&1 | tail -40` reads `tail`'s 0 whatever the
 * suite did (sibling: a gate chain composed with `;` instead of `&&`). Both forms have already burned a
 * session here. So every run now also writes `reports/suite-verdict.json`, and claiming green means
 * READING it: `green === true`, `sha === HEAD`, `!dirty`, `mode === 'full'`. No exit code in that path, so
 * no pipeline can corrupt it — and the sha/dirty stamp is what stops an earlier tree's verdict passing as
 * this one's. It is gitignored: per-machine, per-run local evidence, never shared state.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIERS = join(ROOT, 'reports', 'test-tiers.json');
const CATCHES = join(ROOT, 'reports', 'tier-catches.jsonl');
const VERDICT = join(ROOT, 'reports', 'suite-verdict.json');
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

/**
 * The tree state the suite is about to run AGAINST — captured BEFORE vitest starts, deliberately.
 * A full run can rewrite `reports/test-tiers.json` (tracked), so sampling `dirty` afterwards would report
 * the run's own bookkeeping as a modified tree. What the verdict must describe is the state that was tested.
 */
function treeState() {
  const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout ?? '';
  return { sha: git(['rev-parse', '--short', 'HEAD']).trim(), dirty: git(['status', '--porcelain']).trim() !== '' };
}

/**
 * The verdict record — a PURE function of what the run produced, so it is unit-testable without a suite.
 * `report` is null when the runner produced no JSON (a crash, or `--reporter=json` failing): `green` then
 * comes from the exit status alone and the detail fields are explicitly `null`. A crashed run must read as
 * `green: false`, never as an absent file that a consumer could mistake for "no news".
 * Exported for `server/__tests__/test-tiers.test.ts`.
 */
export function buildVerdict({ mode, status, report, at, sha, dirty }) {
  const green = status === 0;
  if (!report?.testResults) {
    return {
      green, mode, at, sha, dirty,
      files: null, tests: null, failingFiles: null,
      note: 'no JSON report produced — green derived from the runner exit status alone',
    };
  }
  const results = report.testResults;
  // Counts come from `testResults` — one entry per FILE — deliberately, not from the reporter's
  // `num*TestSuites`, which counts `describe` BLOCKS: on this suite that reads 2085 against 520 files.
  // A verdict whose numbers do not match the summary a human reads is a verdict nobody will trust.
  const SKIPPED = new Set(['pending', 'skipped', 'todo', 'disabled']);
  const failingFiles = results
    .filter((t) => t.assertionResults.some((a) => a.status === 'failed'))
    .map((t) => rel(t.name))
    .sort();
  const skippedFiles = results.filter(
    (t) => !t.assertionResults.some((a) => a.status === 'failed') && t.assertionResults.every((a) => SKIPPED.has(a.status)),
  ).length;
  const tally = { passed: 0, failed: 0, skipped: 0 };
  for (const t of results) {
    for (const a of t.assertionResults) {
      if (a.status === 'failed') tally.failed++;
      else if (SKIPPED.has(a.status)) tally.skipped++;
      else tally.passed++;
    }
  }
  return {
    green,
    mode,
    at,
    files: { passed: results.length - failingFiles.length - skippedFiles, failed: failingFiles.length, skipped: skippedFiles },
    tests: tally,
    failingFiles,
    sha,
    dirty,
  };
}

/**
 * Written on EVERY run of every mode that actually executes tests, before any other bookkeeping, so a
 * failure in the tier/catch pass cannot cost the verdict. Best-effort: this artifact must never be the
 * reason a suite run fails.
 */
export function writeVerdict(verdict, dest = VERDICT) {
  try {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(verdict, null, 2)}\n`);
    console.log(
      `\nsuite verdict: ${verdict.green ? 'GREEN' : 'RED'} (mode=${verdict.mode}, sha=${verdict.sha}` +
        `${verdict.dirty ? ', DIRTY tree' : ''}) → ${rel(dest)}`,
    );
  } catch (e) {
    console.error(`suite verdict could not be written (${e.message}) — read the summary lines by hand.`);
  }
}

function runVitest(extraArgs) {
  const r = spawnSync('npx', ['vitest', 'run', ...extraArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return r.status ?? 1;
}

/**
 * #812 (ADR-W-037) — the tracked membership, read as FILE PATHS.
 *
 * The artifact used to carry `{ file, ms }` objects and now carries plain paths. Both shapes are read
 * here, so a working copy that predates the change still runs and every consumer asks ONE function what
 * the slow set is instead of each remembering the entry's shape.
 */
const slowFiles = (tiers) => (tiers?.slow ?? []).map((s) => (typeof s === 'string' ? s : s.file));

// ── fast ───────────────────────────────────────────────────────────────────
function fast() {
  const tiers = readJson(TIERS, null);
  if (!tiers?.slow?.length) {
    console.error(
      'test:fast — no measured tier membership yet (reports/test-tiers.json).\n' +
        'Running the FULL suite instead: a "fast" run with an unknown split would silently skip nothing,\n' +
        'or worse, pretend to be a tier. Run `npm run test:full` once to record timings.',
    );
    const { status } = runAndRecord('fast', []);
    process.exit(status);
  }
  const excludes = slowFiles(tiers).flatMap((f) => ['--exclude', `**/${base(f)}`]);
  // #484: membership is a SHARE of suite time, not a wall-clock cutoff, so the message reports the rule.
  // `thresholdMs` is the pre-#484 field — still read so an older tier file prints something sensible.
  const how = tiers.rule?.kind === 'top-share'
    ? `holding the heaviest ${Math.round(tiers.rule.share * 100)}% of suite time`
    : `measured > ${Math.round((tiers.thresholdMs ?? 60_000) / 1000)}s`;
  console.log(
    `test:fast — excluding ${tiers.slow.length} slow file(s) ${how} ` +
      `(membership from ${tiers.updatedAt}).\nNOT a gate: run \`npm run test:full\` before committing or deploying.`,
  );
  // The verdict stamps `mode: "fast"` even on the no-membership path above, where this mode really did run
  // every file: under-claiming is the safe direction, and a consumer gating on `mode === 'full'` must never
  // be handed a full verdict by a command the workflow declares is not a gate.
  const { status } = runAndRecord('fast', excludes);
  process.exit(status);
}

// ── full ───────────────────────────────────────────────────────────────────
/**
 * Run vitest under the JSON reporter, write the verdict, and hand the caller the raw material.
 * The verdict is written FIRST - before tier/catch bookkeeping - so a fault in that bookkeeping cannot
 * leave a completed run with no record of whether it was green.
 */
function runAndRecord(mode, extraArgs) {
  const { sha, dirty } = treeState();
  const at = new Date().toISOString();
  const out = join(tmpdir(), `geo-suite-${process.pid}.json`);
  const status = runVitest(['--reporter=default', '--reporter=json', `--outputFile.json=${out}`, ...extraArgs]);
  const report = readJson(out, null);
  try {
    rmSync(out, { force: true });
  } catch {
    /* best effort */
  }
  writeVerdict(buildVerdict({ mode, status, report, at, sha, dirty }));
  return { status, report };
}

function full() {
  const { status, report } = runAndRecord('full', []);
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
  const prevSet = new Set(slowFiles(prev));
  const nextSet = new Set(slow.map((s) => s.file));
  const added = [...nextSet].filter((f) => !prevSet.has(f));
  const removed = [...prevSet].filter((f) => !nextSet.has(f));

  // Membership unchanged AND the rule that produced it unchanged → leave the file alone (a routine green
  // run must not dirty the tree). The rule check matters on the run that CHANGES the rule: the membership
  // it yields may coincide with the old list, and the file would then still describe the old rule.
  const sameRule = prev?.rule?.kind === 'top-share' && prev.rule.share === SLOW_SHARE && prev.rule.minMeanMult === MIN_MEAN_MULT;
  if (!added.length && !removed.length && prev && sameRule) return;

  mkdirSync(dirname(TIERS), { recursive: true });
  writeFileSync(TIERS, serializeTiers(slow));
  console.log(`\ntier membership updated (heaviest files holding ${Math.round(SLOW_SHARE * 100)}% of suite time):`);
  for (const f of added) console.log(`  + ${f}`);
  for (const f of removed) console.log(`  - ${f}`);
  // #812: the cutoff this machine happened to measure is REPORTED, not recorded — it is the one number the
  // old artifact carried that nothing ever read back, and writing it is what made a routine membership
  // change collide with every other branch's routine membership change.
  if (slow.length) console.log(`  (this machine's slowest included file measured ${Math.round(slow[slow.length - 1].ms / 1000)}s)`);
  console.log('  commit reports/test-tiers.json so the fast tier matches on every machine.');
}

/**
 * #812 (ADR-W-037) — SERIALIZE the tier artifact: shared state only, one file per line, path-sorted.
 *
 * Three properties, each load-bearing for MERGING rather than for reading:
 *  - **no timings.** `slow[].ms` and `measuredCutoffMs` were the writing machine's wall clock, and no
 *    consumer ever read them back (`classifySlow` measures the CURRENT run). Two branches that each add
 *    a test therefore wrote two different numbers on top of one real one-line change — a guaranteed
 *    textual conflict, on every parallel PR, over values nothing consumes.
 *  - **sorted by PATH, not by time.** The measurement order is a machine's speed ranking, so keeping it
 *    would re-introduce exactly the same churn one field over: a file that merely got faster would move.
 *  - **one line per entry**, so a membership change is an insertion git can merge with another
 *    insertion instead of a rewritten block.
 *
 * Exported so the guard asserts the SERIALIZED bytes — the thing that actually gets committed — rather
 * than a shape one layer above them.
 */
export function serializeTiers(slow) {
  return `${JSON.stringify(
    {
      _comment:
        'MEASURED tier membership (ADR-394, rule relative since #484; #812 dropped the timings). Rewritten ' +
        'by `npm run test:full` only when the SET of slow files changes. It carries the SHARED state and ' +
        'nothing else — no per-machine timings — so two machines that agree on membership produce ' +
        'byte-identical files, and two branches that each add a test merge as two insertions. ' +
        '`npm run test:fast` derives its --exclude list from `slow`.',
      rule: { kind: 'top-share', share: SLOW_SHARE, minMeanMult: MIN_MEAN_MULT },
      updatedAt: new Date().toISOString().slice(0, 10),
      slow: [...new Set(slow.map((s) => (typeof s === 'string' ? s : s.file)))].sort(),
    },
    null,
    2,
  )}\n`;
}

/** Append a record when the full run failed and the fast tier would NOT have. */
function trackCatches(files) {
  const failing = files.filter((f) => f.failures.length);
  if (!failing.length) return;

  const tiers = readJson(TIERS, null);
  const slowSet = new Set(slowFiles(tiers));
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
/**
 * The newest verdict, read back and judged against the CURRENT tree - the question a session actually has
 * ("was the gate green for THIS state?"), which an exit code kept by nobody cannot answer.
 * `report` runs no tests, so it PRINTS the verdict and never writes one: a `mode: "report"` record would
 * be a verdict about nothing, and writing it would destroy the real one - exactly the staleness the sha
 * stamp exists to prevent, installed by the tool itself.
 */
function printVerdict() {
  const v = readJson(VERDICT, null);
  if (!v) {
    console.log('\nNo suite verdict recorded yet - run `npm run test:full` (it writes reports/suite-verdict.json).');
    return;
  }
  const { sha, dirty } = treeState();
  console.log(`\nNewest suite verdict: ${v.green ? 'GREEN' : 'RED'}  (mode=${v.mode}, sha=${v.sha}, at ${v.at})`);
  if (v.failingFiles?.length) console.log(`  failing: ${v.failingFiles.join(', ')}`);
  if (v.note) console.log(`  ${v.note}`);
  const why = [];
  if (!v.green) why.push('the run was RED');
  if (v.mode !== 'full') why.push(`mode is "${v.mode}", not a gate`);
  if (v.sha !== sha) why.push(`it describes ${v.sha}, HEAD is ${sha}`);
  if (v.dirty) why.push('it ran against a DIRTY tree');
  if (dirty && !v.dirty) why.push('the tree has been modified since');
  console.log(why.length ? `  NOT a green gate for this tree: ${why.join('; ')}.` : '  Valid green gate for this tree.');
}

function report() {
  if (!existsSync(CATCHES)) {
    console.log('No failures recorded yet — reports/tier-catches.jsonl does not exist.');
    printVerdict();
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
  const never = slowFiles(tiers).filter((f) => !byFile[f]);
  if (never.length) {
    console.log('\nSlow files with no unique catch on record (candidates to speed up or fold in):');
    for (const f of never) console.log(`       ${f}`);
  }
  printVerdict();
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
