// ANALYTIC PROFILE STEP (#2867) — a CPU profile of ONE student action, and where its time goes. (New as a script:
// the session profiled by hand with `node --cpu-prof`, which also sampled start-up and the pre-state build.)
//
// WHAT IT DOES. Per key, one fresh vite-node process rebuilds the action's recorded pre-state untimed, then samples
// ONLY the action — decide, render, post, the background pool run to completion, settle — at a 500 µs interval and
// summarises the profile: top functions by self and by inclusive time, with source file:line. No LLM (harness.ts:
// decideSubmit only + a fetch stub).
//
// RUN (from the repo root, after driver.mjs):
//   node scripts/perf/analytic/profile.mjs "fixture|answer-in-parameter-q16-2735.analytic.json|3"     key = <source>|<id>|<step>
//   node scripts/perf/analytic/profile.mjs --slowest 5                    the 5 slowest actions of the results file
// Options: --out <dir> (default reports/perf/analytic) · --in <results.jsonl> (default <out>/results.jsonl; pass
//          <out>/only.jsonl after a subset run) · --top 30 · --under <function> (e.g. anotherConfiguration, to scope
//          the summary to one phase) · --timeout-s 600 (per key)
//
// WRITES under <out>/prof: <key>.cpuprofile (open in Chrome DevTools → Performance) and .txt (the run's phases +
// the summary, also printed). About the action's own duration plus ~10 s start-up, per key.
//
// COMPARABILITY: the % columns are comparable anywhere; ms values only on a quiet machine. Profiling adds ~10–30 %.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, readJsonl, safeName, viteNodeSync } from '../lib/common.mjs';
import { profsum } from '../lib/profsum.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = cli();
const OUT = outDir('analytic', args);
const IN = path.resolve(args.arg('--in', path.join(OUT, 'results.jsonl')));
const PROF = path.join(OUT, 'prof');

let keys = args.positional(['--out', '--in', '--top', '--under', '--timeout-s', '--slowest']);
if (!fs.existsSync(IN)) {
  console.log(`no data: ${rel(IN)} not found — run node scripts/perf/analytic/driver.mjs first (a profile replays a RECORDED action's pre-state)`);
  process.exit(0);
}
if (args.has('--slowest')) keys = keys.concat(readJsonl(IN).filter((r) => r.ph).sort((a, b) => b.ph.total - a.ph.total).slice(0, Number(args.arg('--slowest', '5'))).map((r) => r.key));
if (!keys.length) {
  console.log('usage: node scripts/perf/analytic/profile.mjs "<source>|<id>|<step>" …   |   --slowest N');
  process.exit(1);
}
fs.mkdirSync(PROF, { recursive: true });
for (const k of keys) {
  const base = path.join(PROF, safeName(k));
  fs.rmSync(base + '.cpuprofile', { force: true });
  const r = viteNodeSync(path.join(HERE, 'harness.ts'), ['--confirm', k, '--reps', '1', '--in', IN, '--prof', base + '.cpuprofile'], { timeout: Number(args.arg('--timeout-s', '600')) * 1000 });
  if (!fs.existsSync(base + '.cpuprofile')) {
    console.log(`no data: ${k} wrote no profile${r.timedOut ? ' (timed out)' : r.stdout.includes('MISSING ') ? ' — that key is not in ' + rel(IN) : ''} ${r.stderr.trim().split('\n').pop() ?? ''}`);
    continue;
  }
  const phases = r.stdout.split('\n').find((l) => l.startsWith('CONFIRM ')) ?? '';
  const text = `${phases}\n` + profsum(base + '.cpuprofile', { top: Number(args.arg('--top', '30')), under: args.arg('--under') });
  fs.writeFileSync(base + '.txt', text + '\n');
  console.log(`\n### ${k} → ${rel(base)}.{cpuprofile,txt}\n${text}`);
}
