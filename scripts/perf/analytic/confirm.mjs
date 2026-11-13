// ANALYTIC CONFIRM PASS (#2867) — re-measures every slow action of the sweep ON ITS OWN, so a number is not an
// artefact of the long sweep process. (New as a script: the session ran `harness.ts --confirm` by hand.)
//
// WHAT IT DOES. For each key in <out>/to-confirm.txt (summarize.mjs lists every action ≥ 3 s there): ONE fresh
// vite-node process rebuilds the action's recorded pre-state (settled: the pool run to completion), then runs the
// action --reps times and records every phase of every run. No LLM (harness.ts: decideSubmit only + a fetch stub).
//
// RUN (from the repo root, after driver.mjs):
//   node scripts/perf/analytic/confirm.mjs                                every key of the last full sweep — about 20 minutes
//   node scripts/perf/analytic/confirm.mjs "fixture|answer-in-parameter-q16-2735.analytic.json|3"     just these keys
// Options: --out <dir> (default reports/perf/analytic) · --in <results.jsonl> (default <out>/results.jsonl) ·
//          --keys <file> · --reps 2 · --force (redo keys already in confirm.json) · --timeout-s 300 (per key)
//
// WRITES under <out>: confirm.json ({ key: [phases of run 1, phases of run 2] }, merged into across runs), then
// re-runs summarize.mjs so confirmed.json / tableA.md carry the medians. A key that times out is recorded as [].
//
// COMPARABILITY: timings only — run it on a quiet machine, the same one as the sweep it confirms.
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, viteNodeSync, REPO } from '../lib/common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = cli();
const OUT = outDir('analytic', args);
const IN = path.resolve(args.arg('--in', path.join(OUT, 'results.jsonl')));
const outFile = path.join(OUT, 'confirm.json');
const timeout = Number(args.arg('--timeout-s', '300')) * 1000;

let keys = args.positional(['--out', '--in', '--keys', '--reps', '--timeout-s']);
if (!keys.length) {
  const file = path.resolve(args.arg('--keys', path.join(OUT, 'to-confirm.txt')));
  if (!fs.existsSync(file)) {
    console.log(`no data: ${rel(file)} not found — run node scripts/perf/analytic/driver.mjs (or summarize.mjs) first`);
    process.exit(0);
  }
  keys = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
}
if (!fs.existsSync(IN)) {
  console.log(`no data: ${rel(IN)} not found — run node scripts/perf/analytic/driver.mjs first`);
  process.exit(0);
}
if (!keys.length) console.log('no data: nothing to confirm (no action reached the threshold)');

const conf = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const tmp = path.join(OUT, 'confirm-tmp.json');
let n = 0;
for (const k of keys) {
  n += 1;
  if (conf[k]?.length && !args.has('--force')) {
    console.log(`${n}/${keys.length} ${k} — already confirmed (--force to redo)`);
    continue;
  }
  fs.rmSync(tmp, { force: true });
  const r = viteNodeSync(path.join(HERE, 'harness.ts'), ['--confirm', k, '--reps', args.arg('--reps', '2'), '--in', IN, '--out', tmp], { timeout });
  const got = fs.existsSync(tmp) ? (JSON.parse(fs.readFileSync(tmp, 'utf8'))[k] ?? []) : [];
  conf[k] = got;
  fs.writeFileSync(outFile, JSON.stringify(conf));
  const why = r.timedOut ? 'TIMED OUT (killed)' : r.stdout.includes('MISSING ') ? 'no data: that key is not in the results file' : r.stdout.includes('no data') ? r.stdout.trim() : 'no run finished: ' + (r.stderr.trim().split('\n').pop() ?? '');
  console.log(`${n}/${keys.length} ${k} — ${got.length ? got.map((p) => `figure ${p.figure.toFixed(0)} / total ${p.total.toFixed(0)} ms`).join(' ; ') + (r.timedOut ? ' ; then TIMED OUT' : '') : why}`);
}
fs.rmSync(tmp, { force: true });
console.log(`confirm done → ${rel(outFile)}`);
if (fs.existsSync(path.join(OUT, 'results.jsonl')) && IN === path.join(OUT, 'results.jsonl')) spawnSync(process.execPath, [path.join(HERE, 'summarize.mjs'), '--out', OUT], { cwd: REPO, stdio: 'inherit' });
