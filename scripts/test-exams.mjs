#!/usr/bin/env node
/**
 * `npm run test:exams` — replay the exam corpus (#2654 idea 6, ADR-W-172; the corpus is defined in
 * scripts/lib/exam-corpus.mjs).
 *
 *   node scripts/test-exams.mjs                       every builder's exams
 *   node scripts/test-exams.mjs --changed [base]      only the builders the diff against `base` touches
 *                                                     (default origin/main; committed + uncommitted changes)
 *   node scripts/test-exams.mjs --builder analytic    one builder (repeatable)
 *   node scripts/test-exams.mjs --list                print the selection and exit
 *
 * It is the fix-round ITEM's quick exam check (docs/22 §5): the batch gate is `npm run test:full`, which
 * already runs every member. Takes the suite lock (ADR-W-114). Prints a per-builder line — exam units, tests,
 * failures, summed test time — and the wall time, and writes reports/exam-run.json (gitignored, per run).
 * Exit 0 only when every selected replay passed; a selection that is empty (a docs-only diff) exits 0.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireSync } from './suite-lock.mjs';
import { BUILDERS, buildersTouched, summarize, vitestRuns } from './lib/exam-corpus.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const OUT = join(ROOT, 'reports', 'exam-run.json');

const git = (args) => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || '').trim()}`);
  return r.stdout;
};

function parseArgs(argv) {
  const o = { builders: [], changed: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') o.list = true;
    else if (a === '--builder') o.builders.push(argv[++i]);
    else if (a === '--changed') o.changed = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'origin/main';
    else throw new Error(`unknown argument ${a}`);
  }
  for (const b of o.builders) if (!BUILDERS.includes(b)) throw new Error(`unknown builder ${b} (one of ${BUILDERS.join(', ')})`);
  return o;
}

function changedFiles(base) {
  const mergeBase = git(['merge-base', base, 'HEAD']).trim();
  const committed = git(['diff', '--name-only', `${mergeBase}...HEAD`]);
  const working = git(['diff', '--name-only', 'HEAD']);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  return [...new Set(`${committed}\n${working}\n${untracked}`.split('\n').map((s) => s.trim()).filter(Boolean))];
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  let builders = o.builders.length ? o.builders : BUILDERS;
  let why = o.builders.length ? 'asked' : 'all builders';
  if (o.changed) {
    const files = changedFiles(o.changed);
    const boundaries = JSON.parse(readFileSync(join(ROOT, 'BOUNDARIES.json'), 'utf8'));
    builders = buildersTouched(files, boundaries).filter((b) => builders.includes(b));
    why = `${files.length} file(s) changed against ${o.changed}`;
  }
  console.log(`test:exams — ${builders.length ? builders.join(', ') : 'no builder'} (${why})`);
  const runs = vitestRuns(builders);
  if (o.list) {
    for (const r of runs) console.log(`  ${r.kind}: ${r.args.join(' ')}`);
    return 0;
  }
  if (!runs.length) {
    console.log('  nothing to replay: the change touches no builder.');
    return 0;
  }

  const release = acquireSync(`test:exams in ${ROOT}`);
  const t0 = Date.now();
  const reports = [];
  let status = 0;
  try {
    for (const [i, r] of runs.entries()) {
      const json = join(tmpdir(), `geo-exams-${process.pid}-${i}.json`);
      // Spawned without a shell, so the Hebrew in the name pattern reaches vitest intact on Windows.
      const res = spawnSync(process.execPath, [VITEST, 'run', ...r.args, '--reporter=dot', '--reporter=json', `--outputFile.json=${json}`], {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, GEO_SUITE_LOCK_HELD: '1' },
      });
      if (res.status !== 0) status = res.status ?? 1;
      try {
        reports.push(JSON.parse(readFileSync(json, 'utf8')));
        rmSync(json, { force: true });
      } catch {
        status = status || 1;
        console.error(`  ${r.kind} run wrote no JSON report`);
      }
    }
  } finally {
    release();
  }
  const wallMs = Date.now() - t0;
  const byBuilder = summarize(reports);
  console.log(`\ntest:exams — wall ${(wallMs / 1000).toFixed(1)} s`);
  for (const b of builders) {
    const r = byBuilder[b];
    console.log(`  ${b.padEnd(8)} ${String(r.units).padStart(4)} exam units · ${String(r.tests).padStart(4)} tests · ${r.failed} failed · ${(r.testMs / 1000).toFixed(1)} s of test time`);
    for (const f of r.failures) console.log(`      ✗ ${f}`);
  }
  const failed = builders.reduce((n, b) => n + byBuilder[b].failed, 0);
  const green = status === 0 && failed === 0;
  try {
    mkdirSync(dirname(OUT), { recursive: true });
    const sha = git(['rev-parse', '--short', 'HEAD']).trim();
    writeFileSync(OUT, `${JSON.stringify({ green, at: new Date().toISOString(), sha, builders, why, wallMs, byBuilder }, null, 2)}\n`);
  } catch (e) {
    console.error(`reports/exam-run.json could not be written (${e.message})`);
  }
  console.log(`exam verdict: ${green ? 'GREEN' : 'RED'} → reports/exam-run.json`);
  return green ? 0 : status || 1;
}

try {
  process.exit(main());
} catch (e) {
  console.error(`test:exams: ${e.message}`);
  process.exit(2);
}
