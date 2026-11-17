// 3-D CONFIRM PASS (#2867) — re-measures every slow action of the sweep with its task run ON ITS OWN, so a number
// is not an artefact of the long warm sweep process.
//
// WHAT IT DOES. Every TASK holding an action ≥ --min ms in the sweep is re-run alone, twice, each time in a fresh
// vite-node process (the task's actions replay in order, every one timed); per flagged action it records both runs,
// their mean ("median" of two) and the clock-free counters. No LLM (sweep3.ts: deterministic lane only + fetch stub).
//
// RUN (from the repo root, after drive3.mjs):
//   node scripts/perf/3d/confirm3.mjs                                every flagged task of the last full sweep — about 1 hour
//   node scripts/perf/3d/confirm3.mjs "issue:#2787 square" --min 0   just these tasks (every action ≥ --min of each)
// Options: --out <dir> (default reports/perf/3d) · --min 3000 · --in <results.jsonl> · --force (redo tasks already
//          in confirm.jsonl) · --timeout-s 600 (per run)
//
// WRITES under <out>: confirm.jsonl (appended; a task already there is skipped, so an interrupted pass resumes),
// then re-runs analyze3.mjs so measurements.json / tableA.md carry the confirmed numbers.
//
// COMPARABILITY: runs / median are timings — quiet machine only. resolves / lmSolves / lmEvals are clock-free.
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, readJsonl, viteNodeSync, REPO } from '../lib/common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = cli();
const OUT_DIR = outDir('3d', args);
const MIN = Number(args.arg('--min', 3000));
const IN = path.resolve(args.arg('--in', path.join(OUT_DIR, 'results.jsonl')));
const OUT = path.join(OUT_DIR, 'confirm.jsonl');
const timeout = Number(args.arg('--timeout-s', '600')) * 1000;
const wanted = args.positional(['--out', '--min', '--in', '--timeout-s']);

const sweep = readJsonl(IN);
if (!sweep.length) {
  console.log(`no data: ${rel(IN)} is missing or empty — run node scripts/perf/3d/drive3.mjs first`);
  process.exit(0);
}
const rows = sweep.filter((r) => r.ms >= MIN && (!wanted.length || wanted.includes(r.task)));
const tasks = [...new Set(rows.map((r) => r.task))];
const done = new Set(args.has('--force') ? [] : readJsonl(OUT).map((r) => r.task));
console.log(`${rows.length} actions >= ${MIN} ms in ${tasks.length} tasks`);
if (!tasks.length) console.log('no data: nothing to confirm');

const tmp = path.join(OUT_DIR, 'confirm-tmp.jsonl');
function run(task) {
  writeFileSync(tmp, '');
  viteNodeSync(path.join(HERE, 'sweep3.ts'), ['--out', tmp, '--only', task], { timeout });
  const m = new Map();
  for (const l of readFileSync(tmp, 'utf8').trim().split('\n').filter(Boolean)) { const r = JSON.parse(l); m.set(r.ai, r); }
  return m;
}
let n = 0;
for (const task of tasks) {
  n++;
  if (done.has(task)) { console.log(`${n}/${tasks.length} ${task} — already confirmed (--force to redo)`); continue; }
  const a = run(task);
  const b = run(task);
  const line = [];
  for (const r of rows.filter((x) => x.task === task)) {
    const ra = a.get(r.ai), rb = b.get(r.ai);
    const ms = [ra?.ms, rb?.ms].filter((x) => x != null);
    const median = ms.length ? Math.round(ms.reduce((s, x) => s + x, 0) / ms.length) : null;
    appendFileSync(OUT, JSON.stringify({ ...r, sweepMs: r.ms, runs: [ra?.ms ?? null, rb?.ms ?? null], median, decideMs: [ra?.decideMs, rb?.decideMs], renderMs: [ra?.renderMs, rb?.renderMs],
      resolves: ra?.resolves, lmSolves: ra?.lmSolves, lmEvals: ra?.lmEvals, verdictNow: ra?.verdict ?? rb?.verdict ?? 'missing' }) + '\n');
    line.push(`#${r.ai} ${r.kind} ${median ?? 'no run finished'}${median != null ? ' ms' : ''}`);
  }
  console.log(`${n}/${tasks.length} ${task} — ${line.join(', ')}`);
}
rmSync(tmp, { force: true });
console.log(`confirm done → ${rel(OUT)}`);
if (existsSync(path.join(OUT_DIR, 'results.jsonl'))) spawnSync(process.execPath, [path.join(HERE, 'analyze3.mjs'), '--out', OUT_DIR], { cwd: REPO, stdio: 'inherit' });
