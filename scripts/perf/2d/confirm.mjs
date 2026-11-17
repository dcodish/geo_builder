// 2-D CONFIRM PASS (#2867) — re-measures every slow action of the sweep ON ITS OWN, so a number is not an artefact
// of the long sweep process (warm caches, GC, a neighbour's work). (Replaces the session's confirm.sh.)
//
// WHAT IT DOES. For each item holding an action ≥ 3 s (analyze.mjs lists them in <out>/confirm-targets.txt): ONE
// fresh vite-node process rebuilds the item's prefix untimed and times the flagged actions, twice (--runs). The
// second run of each action is CPU-profiled (prof/<item>-<si>-<k>.cpuprofile + a .txt summary) unless --no-profile.
// No LLM: it runs perf2d.ts, which stubs fetch and drives only the deterministic lane.
//
// RUN (from the repo root, after driver.mjs):
//   node scripts/perf/2d/confirm.mjs                       every target of the last full sweep — about 1 hour
//   node scripts/perf/2d/confirm.mjs "12:9,12:10" "40:3"   just these (one argument per item: "itemIdx:si,itemIdx:si")
// Options: --out <dir> (default reports/perf/2d) · --targets <file> · --runs 2 · --no-profile · --force (re-measure
//          items already in confirm.jsonl) · --timeout-s 1500 (per item)
//
// WRITES under <out>: confirm.jsonl (appended: one record per run, with "run":1|2 and "confirmOf":<itemIdx>),
// prof/*.cpuprofile + prof/*.txt, then re-runs analyze.mjs so measurements.json / tableA.md carry the medians.
//
// COMPARABILITY: timings only — run it on a quiet machine, the same one as the sweep it confirms.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, readJsonl, viteNodeSync, REPO } from '../lib/common.mjs';
import { profsum } from '../lib/profsum.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = cli();
const OUT = outDir('2d', args);
const jobs = path.resolve(args.arg('--jobs', path.join(OUT, 'jobs.json')));
const PROF = path.join(OUT, 'prof');
const outFile = path.join(OUT, 'confirm.jsonl');
const runs = args.arg('--runs', '2');
const timeout = Number(args.arg('--timeout-s', '1500')) * 1000;

let lines = args.positional(['--out', '--jobs', '--targets', '--runs', '--timeout-s']);
if (!lines.length) {
  const file = path.resolve(args.arg('--targets', path.join(OUT, 'confirm-targets.txt')));
  if (!existsSync(file)) {
    console.log(`no data: ${rel(file)} not found — run node scripts/perf/2d/driver.mjs (or analyze.mjs) first`);
    process.exit(0);
  }
  lines = readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
}
if (!lines.length) {
  console.log('no data: nothing to confirm (no action reached the threshold)');
  process.exit(0);
}
if (!existsSync(jobs)) {
  console.log(`no data: ${rel(jobs)} not found — run node scripts/perf/2d/driver.mjs first`);
  process.exit(0);
}
const done = new Set(args.has('--force') ? [] : readJsonl(outFile).map((r) => `${r.confirmOf}:${r.si}`));
mkdirSync(PROF, { recursive: true });
let n = 0;
for (const line of lines) {
  n += 1;
  if (line.split(',').every((t) => done.has(t))) {
    console.log(`${n}/${lines.length} ${line} — already confirmed (--force to redo)`);
    continue;
  }
  const a = ['--confirm', line, '--runs', runs, '--jobs', jobs, '--out', OUT];
  if (!args.has('--no-profile')) a.push('--profile-confirm', '--prof-dir', PROF);
  const r = viteNodeSync(path.join(HERE, 'perf2d.ts'), a, { viteOpts: ['--mode', 'production'], timeout });
  const recs = r.stdout.split('\n').filter((l) => l.startsWith('@@REC ')).map((l) => JSON.parse(l.slice(6)));
  for (const rec of recs) appendFileSync(outFile, JSON.stringify({ confirmOf: line.split(':')[0], ...rec }) + '\n');
  const ms = recs.filter((x) => typeof x.total_ms === 'number').map((x) => `${x.k}${x.press ? '#' + x.press : ''}@${x.si}=${Math.round(x.total_ms)}`);
  console.log(`${n}/${lines.length} ${line} — ${r.timedOut ? 'TIMED OUT (killed)' : recs.length ? ms.join(' ') : 'no record (child failed: ' + r.stderr.trim().split('\n').pop() + ')'}`);
}
// a readable summary next to every profile that lacks one
for (const f of readdirSync(PROF).filter((x) => x.endsWith('.cpuprofile'))) {
  const txt = path.join(PROF, f.replace(/\.cpuprofile$/, '.txt'));
  if (!existsSync(txt)) writeFileSync(txt, profsum(path.join(PROF, f), { top: 30 }) + '\n');
}
console.log(`confirm done → ${rel(outFile)}, profiles in ${rel(PROF)}/`);
spawnSync(process.execPath, [path.join(HERE, 'analyze.mjs'), '--out', OUT], { cwd: REPO, stdio: 'inherit' });
