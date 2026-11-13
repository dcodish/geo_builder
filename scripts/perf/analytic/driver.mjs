// ANALYTIC TIMING SWEEP — the entry point of the analytic builder's long-wait harness (#2867).
//
// WHAT IT MEASURES. How long the analytic App makes a student wait for each action — submit a line, «הציגו תצורה
// אחרת», load a saved figure, delete or edit a row — by replaying real sequences through the functions App.tsx
// calls, split by lane: figure (main thread, blocking until the figure shows), post (main, after paint), pool
// (background, time-sliced) and settle (harness.ts has the detail). Corpora: known-issue stresses, the fixtures and
// corpus arrays in src-analytic/__tests__/fixtures, folded-sequences.json, prod sessions
// (logs/perf-prod-events-analytic.jsonl, else logs/prod-events-analytic.jsonl) and the operator's dev sessions
// (logs/debug-log-analytic.jsonl). A missing log is "no data". No LLM call is ever made (harness.ts: decideSubmit
// only + a fetch stub).
//
// RUN (from the repo root):
//   node scripts/perf/analytic/driver.mjs                                   full sweep — about 35 minutes
//   node scripts/perf/analytic/driver.mjs --only "answer-in-parameter-q16-2735.analytic.json,#1647 touch sentence"   a few jobs — seconds each
// then  node scripts/perf/analytic/confirm.mjs   (re-measure every ≥3 s action twice, alone — about 20 minutes)
//       node scripts/perf/analytic/profile.mjs "<key>"   (one action's CPU profile + summary; or --slowest 5)
//       node scripts/perf/analytic/summarize.mjs   (counts, the slow table, measurements.json — seconds; the sweep runs it at the end)
// Options: --out <dir> (default reports/perf/analytic) · --from J --to K (job index range) · --limit-ms N (default 60000) ·
//          --prod <events.jsonl> · --debug <debug-log.jsonl> (other log files than the defaults)
// Job ids: `node node_modules/vite-node/vite-node.mjs scripts/perf/analytic/harness.ts -- --list` (prints <source>|<id>).
//
// WRITES (all under <out>, gitignored — the results carry prod utterances, never commit them):
//   results.jsonl   one record per timed action, keyed `<source>|<id>|<step>` (a full sweep; the previous one moves to previous/)
//   only.jsonl      the same, for an --only / --from / --to subset run (replaced each time)
//   commit.txt      the commit the sweep ran on
//   + summarize.mjs outputs: measurements.json, to-confirm.txt, counts.md
//
// WATCHDOG. ONE vite-node child at a time; a phase silent for the limit is killed, recorded as ">60 s", and the
// sweep resumes at the next job.
//
// COMPARABILITY. Every phase value is a wall-clock timing: comparable only on a QUIET machine, same machine, before
// vs after. `work` (the work meter's three counts, #2873: all the solver work, the part on the page, the part before the paint),
// `poolSlices` (background seeds walked) and `verdict` are clock-free and comparable anywhere.
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, rotate, viteNode, killTree, lineReader, commitStamp, passThrough, REPO } from '../lib/common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = cli();
const OUT_DIR = outDir('analytic', args);
const only = args.arg('--only');
const subset = Boolean(only || args.has('--from') || args.has('--to'));
const out = path.join(OUT_DIR, subset ? 'only.jsonl' : 'results.jsonl');
const LIMIT = Number(args.arg('--limit-ms', '60000'));
const STARTUP_GRACE = 120_000;
let from = Number(args.arg('--from', '0'));

if (!subset) rotate(OUT_DIR, ['results.jsonl', 'confirm.json', 'confirmed.json', 'measurements.json', 'to-confirm.txt', 'counts.md', 'tableA.md', 'prof', 'commit.txt']);
fs.writeFileSync(out, '');
if (!subset) fs.writeFileSync(path.join(OUT_DIR, 'commit.txt'), commitStamp() + '\n');
console.log(`sweeping ${only ?? 'every job'} → ${rel(out)}`);

function runFrom(start) {
  return new Promise((resolve) => {
    const a = ['--from', String(start), '--out', out, ...passThrough(args, ['--prod', '--debug'])];
    if (args.arg('--to')) a.push('--to', args.arg('--to'));
    if (only) a.push('--only', only);
    const child = viteNode(path.join(HERE, 'harness.ts'), a);
    let last = Date.now();
    let seen = false; // until its first line the child is starting up (transform + reading the corpora), not hung in an action
    let current = null; // last BEGIN line
    let curJob = start;
    let finished = false;
    let settled = false;
    child.stdout.on(
      'data',
      lineReader((line) => {
        last = Date.now();
        seen = true;
        if (line.startsWith('BEGIN ')) current = line;
        else if (line.startsWith('JOB ')) { curJob = Number(line.split(' ')[1]); current = null; process.stdout.write(line + '\n'); }
        else if (line === 'ALLDONE') finished = true;
      }),
    );
    child.stderr.on('data', (d) => process.stderr.write(d));
    const timer = setInterval(() => {
      if (Date.now() - last > (seen ? LIMIT : Math.max(LIMIT, STARTUP_GRACE))) {
        clearInterval(timer);
        settled = true;
        const [, j, s, k, p] = (current ?? `BEGIN ${curJob} ? ? ?`).split(' ');
        fs.appendFileSync(out, JSON.stringify({ job: Number(j), step: s, kind: k, phase: p, timeout: `>${LIMIT / 1000} s` }) + '\n');
        process.stdout.write(`TIMEOUT job ${j} step ${s} ${k} ${p}\n`);
        killTree(child);
        resolve({ next: Number(j) + 1, done: false });
      }
    }, 2000);
    child.on('exit', () => {
      clearInterval(timer);
      if (!settled) resolve(finished ? { done: true } : { next: curJob + 1, done: false, crashed: true });
    });
  });
}

const t0 = Date.now();
let crashes = 0;
for (;;) {
  const r = await runFrom(from);
  if (r.done) break;
  if (r.crashed) {
    fs.appendFileSync(out, JSON.stringify({ job: r.next - 1, crashed: true }) + '\n');
    crashes += 1;
    if (crashes >= 3 && r.next - 1 === from) { process.stdout.write('the harness child keeps exiting at start-up — see the error above; stopping\n'); break; }
  }
  from = r.next;
}
process.stdout.write(`SWEEP DONE in ${((Date.now() - t0) / 60000).toFixed(1)} min → ${rel(out)}\n`);
spawnSync(process.execPath, [path.join(HERE, 'summarize.mjs'), '--out', OUT_DIR, ...(subset ? ['--in', out, '--list'] : [])], { cwd: REPO, stdio: 'inherit' });
