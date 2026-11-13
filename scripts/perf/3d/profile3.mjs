// 3-D PROFILE STEP (#2867) — a CPU profile of ONE student action, and where its time goes.
//
// WHAT IT DOES. Per target, one fresh vite-node process replays the task's earlier actions untimed, then samples
// ONLY the target action (200 µs interval) and summarises the profile: top functions by self and by inclusive time
// with exact source file:line (mapped through vite-node's own transformed modules, dumped fresh into <out>/dump on
// every run so the lines match the code being profiled). No LLM (sweep3.ts: deterministic lane only + fetch stub).
//
// RUN (from the repo root):
//   node scripts/perf/3d/profile3.mjs "issue:#2787 square@2"      task id @ action index (the `ai` of its record)
//   node scripts/perf/3d/profile3.mjs --slowest 5                  the 5 slowest actions of confirm.jsonl (else results.jsonl)
// Options: --out <dir> (default reports/perf/3d) · --top 40 · --under <function> · --timeout-s 600 (per target)
//
// WRITES under <out>/profiles: <task>-<ai>.cpuprofile (open in Chrome DevTools → Performance) and .txt (the action's
// record + the summary, also printed). About the action's own duration plus ~10 s start-up, per target.
//
// COMPARABILITY: the % columns and the record's resolves / lmSolves / lmEvals counters are comparable anywhere; the
// ms values only on a quiet machine. Profiling itself adds roughly 10–30 %.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, readJsonl, safeName, viteNodeSync } from '../lib/common.mjs';
import { profsum } from '../lib/profsum.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.join(HERE, 'sweep3.ts');
const args = cli();
const OUT_DIR = outDir('3d', args);
const P = path.join(OUT_DIR, 'profiles');
const DUMP = path.join(OUT_DIR, 'dump');

let targets = args.positional(['--out', '--top', '--under', '--timeout-s', '--slowest']).map((t) => {
  const at = t.lastIndexOf('@');
  return at > 0 ? [t.slice(0, at), Number(t.slice(at + 1))] : null;
});
if (targets.includes(null)) {
  console.log('a target is "<task id>@<action index>", e.g. "issue:#2787 square@2"');
  process.exit(1);
}
if (args.has('--slowest')) {
  const conf = readJsonl(path.join(OUT_DIR, 'confirm.jsonl')).filter((r) => r.median != null).map((r) => [r.task, r.ai, r.median]);
  const rows = conf.length ? conf : readJsonl(path.join(OUT_DIR, 'results.jsonl')).filter((r) => !r.timeout).map((r) => [r.task, r.ai, r.ms]);
  if (!rows.length) console.log(`no data: no confirm.jsonl / results.jsonl in ${rel(OUT_DIR)} — run node scripts/perf/3d/drive3.mjs first`);
  targets = targets.concat(rows.sort((a, b) => b[2] - a[2]).slice(0, Number(args.arg('--slowest', '5'))).map(([t, ai]) => [t, ai]));
}
if (!targets.length) {
  console.log('usage: node scripts/perf/3d/profile3.mjs "<task id>@<action index>" …   |   --slowest N');
  process.exit(args.has('--slowest') ? 0 : 1);
}

mkdirSync(P, { recursive: true });
// vite-node's transformed modules (each with its sourcemap), for exact line numbers — always fresh: a stale dump maps to the wrong lines
rmSync(DUMP, { recursive: true, force: true });
viteNodeSync(HARNESS, ['--count'], { viteOpts: [`--options.debug.dumpModules=${DUMP}`], timeout: 300_000 });
const dump = existsSync(DUMP) ? DUMP : undefined;
if (!dump) console.log('the module dump failed — line numbers fall back to "by declaration"');

const tmp = path.join(OUT_DIR, 'prof-tmp.jsonl');
for (const [task, ai] of targets) {
  const base = path.join(P, `${safeName(task)}-${ai}`);
  rmSync(base + '.cpuprofile', { force: true });
  writeFileSync(tmp, '');
  const r = viteNodeSync(HARNESS, ['--out', tmp, '--only', task, '--action', String(ai), '--prof', base + '.cpuprofile'], { timeout: Number(args.arg('--timeout-s', '600')) * 1000 });
  if (!existsSync(base + '.cpuprofile')) {
    console.log(`no data: ${task}@${ai} wrote no profile${r.timedOut ? ' (timed out)' : ''} — does task "${task}" exist and have an action ${ai}? ${r.stderr.trim().split('\n').pop() ?? ''}`);
    continue;
  }
  const row = readFileSync(tmp, 'utf8').trim();
  const text = `${task} #${ai}\n${row}\n` + profsum(base + '.cpuprofile', { top: Number(args.arg('--top', '40')), under: args.arg('--under'), dump });
  writeFileSync(base + '.txt', text + '\n');
  console.log(`\n### ${task}@${ai} → ${rel(base)}.{cpuprofile,txt}\n${text}`);
}
rmSync(tmp, { force: true });
