#!/usr/bin/env node
// THE WORK METER's command line (#2873, ADR-W-210 phase 0) — re-record, check and read the baselines.
//
// The work meter counts each builder's solver work per student action, in units, never seconds (shell/workMeter.ts).
// Each builder's `<tree>/__tests__/work-meter-gate.test.ts` walks its fixtures and holds every action against
// `<tree>/__tests__/work-meter/baseline.jsonl`; `npm run test:full` runs those gates. This script is the same walk,
// asked for by hand. It runs under vitest (so 2-D's searches run with no clock, exactly as the gate's do) and takes
// the suite lock like every other test run.
//
// RUN (from the repo root):
//   npm run work:record -- 2d                     re-record one builder's baseline (2d | 3d | analytic | complex | all)
//   npm run work:record -- 3d --only <fixture>    only the figures whose name contains the text (a new fixture: seconds)
//   npm run work:record -- 2d --accept-rise       also write counts that ROSE (never by default) and print the before/after
//   npm run work:check -- analytic                the gate alone, without the rest of the suite
//   npm run work:check -- 2d --order reverse      … walking the figures in another order (reverse | shuffle:<seed>)
//   npm run work:report                           the builders' totals, read from the committed baselines (no run)
//   … --slow                                      the SLOW corpus instead of the fixtures: the open speed issues' own
//                                                 sequences, against `baseline-slow.jsonl`. Too slow for the suite, so
//                                                 it is recorded and checked here, on demand.
//
// WHEN: docs/08 "The work meter". In short — a new or changed fixture is recorded before it is committed; a count that
// fell is locked by re-recording; a count that rose is a regression until the change's ADR carries the numbers
// (docs/17 §7), and only then `--accept-rise`.
//
// WRITES: `<tree>/__tests__/work-meter/baseline[-slow].jsonl` (record only) and `reports/work-meter/<builder>[-slow].json`
// (every run: the counts, the wall time of each action, what rose and fell). Timings never reach the baseline.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (k) => argv.includes(k);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const VALUE_FLAGS = ['--only', '--order'];
const names = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !VALUE_FLAGS.includes(all[i - 1]));

/** Every product tree that has a gate, by its label (BOUNDARIES.json is the registry of trees). */
const trees = JSON.parse(readFileSync(path.join(REPO, 'BOUNDARIES.json'), 'utf8')).trees;
const BUILDERS = Object.fromEntries(
  Object.entries(trees)
    .map(([tree, t]) => [t.label, tree])
    .filter(([, tree]) => existsSync(path.join(REPO, tree, '__tests__', 'work-meter-gate.test.ts'))),
);
const UNIT = { '2d': 'evaluateCore calls', '3d': 'residual evaluations (leastSquares)', analytic: 'residual evaluations (solveLM, rank, root scan)', complex: 'line reads + exact solves' };

function usage(code) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 27).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(code);
}
if (!['record', 'check', 'report'].includes(cmd)) usage(cmd ? 1 : 0);
const wanted = names.length === 0 || names.includes('all') ? Object.keys(BUILDERS) : names;
const unknown = wanted.filter((n) => !BUILDERS[n]);
if (unknown.length) {
  console.error(`no builder named ${unknown.join(', ')} — the builders with a work-meter gate are: ${Object.keys(BUILDERS).join(', ')}`);
  process.exit(1);
}
const slow = flag('--slow');
const baselineOf = (b) => path.join(REPO, BUILDERS[b], '__tests__', 'work-meter', slow ? 'baseline-slow.jsonl' : 'baseline.jsonl');

function readLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((o) => o._ === undefined);
}

function report() {
  const n = (x) => x.toLocaleString('en-US');
  const pct = (x, of) => (of ? `${((100 * x) / of).toFixed(1)}%` : '—');
  for (const b of wanted) {
    const lines = readLines(baselineOf(b));
    if (!lines.length) {
      console.log(`${b}: no ${slow ? 'slow-corpus ' : ''}baseline recorded (${path.relative(REPO, baselineOf(b))})`);
      continue;
    }
    const figures = new Set(lines.map((l) => l.k.slice(0, l.k.lastIndexOf('|'))));
    const sum = (rows, f) => rows.reduce((s, l) => s + l[f], 0);
    const total = sum(lines, 'total');
    console.log(`\n${b} — ${figures.size} figures, ${lines.length} actions · unit: ${UNIT[b] ?? 'work units'}`);
    console.log(`  total ${n(total)} · on the page ${n(sum(lines, 'page'))} (${pct(sum(lines, 'page'), total)}) · before the paint ${n(sum(lines, 'prePaint'))} (${pct(sum(lines, 'prePaint'), total)})`);
    const kinds = new Map();
    for (const l of lines) {
      const kind = l.k.slice(l.k.lastIndexOf('|') + 1).replace(/#\d+$/, '');
      kinds.set(kind, [...(kinds.get(kind) ?? []), l]);
    }
    console.log(`  ${'action'.padEnd(9)} ${'n'.padStart(6)} ${'total'.padStart(14)} ${'page'.padStart(8)} ${'before paint'.padStart(13)}`);
    for (const [kind, rows] of [...kinds].sort((a, c) => sum(c[1], 'total') - sum(a[1], 'total')))
      console.log(`  ${kind.padEnd(9)} ${String(rows.length).padStart(6)} ${n(sum(rows, 'total')).padStart(14)} ${pct(sum(rows, 'page'), sum(rows, 'total')).padStart(8)} ${pct(sum(rows, 'prePaint'), sum(rows, 'total')).padStart(13)}`);
  }
}
if (cmd === 'report') {
  report();
  process.exit(0);
}

// record / check: the gates themselves, one builder after another (a re-record rewrites a file; nothing else may hold it)
let failed = false;
for (const b of wanted) {
  const env = { ...process.env, WORK_METER_REPORT: path.join(REPO, 'reports', 'work-meter', `${b}${slow ? '-slow' : ''}.json`) };
  if (cmd === 'record') env.WORK_METER = 'record';
  if (flag('--accept-rise')) env.WORK_METER_ACCEPT_RISE = '1';
  if (opt('--only')) env.WORK_METER_ONLY = opt('--only');
  if (opt('--order')) env.WORK_METER_ORDER = opt('--order');
  if (slow) env.WORK_METER_CORPUS = 'slow';
  const gate = `${BUILDERS[b]}/__tests__/work-meter-gate.test.ts`;
  console.log(`\n── work meter: ${cmd} ${b}${slow ? ' (slow corpus)' : ''}${opt('--only') ? ` — only «${opt('--only')}»` : ''} ──`);
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'suite-lock.mjs'), 'npx', 'vitest', 'run', gate], { cwd: REPO, env, stdio: 'inherit', shell: false });
  if (r.status !== 0) failed = true;
}
if (!failed && cmd === 'record') {
  console.log('');
  report();
  console.log(`\nCommit the baseline${wanted.length > 1 ? 's' : ''} with the change that moved ${wanted.length > 1 ? 'them' : 'it'}.`);
}
process.exit(failed ? 1 : 0);
