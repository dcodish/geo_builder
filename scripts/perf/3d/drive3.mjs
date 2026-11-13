// 3-D TIMING SWEEP — the entry point of the 3-D long-wait harness (#2867).
//
// WHAT IT MEASURES. How long the 3-D App makes a student wait for each action — submit a line, «הציגו תצורה אחרת»,
// load a saved figure, delete a row — by replaying real sequences through the real 3-D code, all on the main thread
// (3-D has no worker; sweep3.ts has the breakdown). Corpora: fixtures3/, prod sessions (logs/perf-prod-events-3d.jsonl,
// else logs/prod-events-3d.jsonl), the operator's dev sessions (logs/debug-log-3d.jsonl) and known slow issue
// sequences. A missing log is "no data". No LLM call is ever made (sweep3.ts: deterministic lane only + fetch stub).
//
// RUN (from the repo root):
//   node scripts/perf/3d/drive3.mjs                                    full sweep — about 30 minutes
//   node scripts/perf/3d/drive3.mjs --only "fx:altitude-on-existing-d-1942.geo3.json,issue:#2787 square"    a few tasks — seconds each
// then  node scripts/perf/3d/confirm3.mjs   (re-run every task holding a ≥3 s action twice, alone — about 1 hour)
//       node scripts/perf/3d/profile3.mjs "<task>@<action#>"   (one action's CPU profile + summary; or --slowest 5)
//       node scripts/perf/3d/analyze3.mjs   (counts, the slow table, measurements.json — seconds; the sweep runs it at the end)
// Options: --out <dir> (default reports/perf/3d) · --from N (task index) · --limit-ms N (default 60000) ·
//          --prod <events.jsonl> · --debug <debug-log.jsonl> (other log files than the defaults)
// Task ids: `node node_modules/vite-node/vite-node.mjs scripts/perf/3d/sweep3.ts -- --list`.
//
// WRITES (all under <out>, gitignored — the results carry prod utterances, never commit them):
//   results.jsonl   one record per timed action (a full sweep; the previous one moves to previous/)
//   only.jsonl      the same, for an --only / --from subset run (replaced each time)
//   commit.txt      the commit the sweep ran on; heartbeat.json (the watchdog's own file)
//   + analyze3.mjs outputs: measurements.json, counts.md, tableA.md
//
// WATCHDOG. ONE vite-node child at a time; an action running past the limit is recorded as ">60 s", the child is
// killed (with its process tree) and the sweep restarts at the NEXT task (the rest of that task is skipped).
//
// COMPARABILITY. ms / decideMs / renderMs are wall-clock timings: comparable only on a QUIET machine, same machine,
// before vs after. The counters in every record — uncached, resolves, lmSolves, lmEvals — are CLOCK-FREE: the same
// code gives the same counts on any machine under any load, so they are the numbers to compare across sessions.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, rotate, viteNode, killTree, commitStamp, passThrough, REPO } from '../lib/common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = cli();
const OUT_DIR = outDir('3d', args);
const only = args.arg('--only');
const subset = Boolean(only || args.has('--from'));
const OUT = path.join(OUT_DIR, subset ? 'only.jsonl' : 'results.jsonl');
const HB = path.join(OUT_DIR, 'heartbeat.json');
const LIMIT = Number(args.arg('--limit-ms', '60000'));

if (!subset) rotate(OUT_DIR, ['results.jsonl', 'confirm.jsonl', 'measurements.json', 'counts.md', 'tableA.md', 'profiles', 'commit.txt']);
writeFileSync(OUT, '');
if (!subset) writeFileSync(path.join(OUT_DIR, 'commit.txt'), commitStamp() + '\n');
console.log(`sweeping ${only ?? 'every task'} → ${rel(OUT)}`);

function runFrom(start) {
  return new Promise((resolve) => {
    writeFileSync(HB, '{}');
    const a = ['--out', OUT, '--hb', HB, '--from', String(start), ...passThrough(args, ['--prod', '--debug'])];
    if (only) a.push('--only', only);
    const child = viteNode(path.join(HERE, 'sweep3.ts'), a, { stdio: ['ignore', 'inherit', 'inherit'] });
    let last = '';
    let since = Date.now();
    let settled = false;
    const iv = setInterval(() => {
      let hb = {};
      try { hb = JSON.parse(readFileSync(HB, 'utf8')); } catch {}
      const key = `${hb.ti}:${hb.ai}:${hb.done ?? ''}`;
      if (key !== last) { last = key; since = Date.now(); if (hb.ai === 0 || hb.done) process.stdout.write(`\r task ${hb.ti} `); }
      if (hb.ai !== undefined && !hb.done && Date.now() - since > LIMIT) {
        clearInterval(iv);
        settled = true;
        appendFileSync(OUT, JSON.stringify({ ti: hb.ti, ai: hb.ai, task: hb.id, corpus: hb.corpus, user: hb.user, kind: hb.kind, prior: hb.prior, utterance: hb.utterance, ms: LIMIT, timeout: true, verdict: `>${LIMIT / 1000} s (killed; rest of task skipped)`, thread: 'main' }) + '\n');
        process.stdout.write(`\nTIMEOUT task ${hb.ti} (${hb.id}) action ${hb.ai} ${hb.kind}\n`);
        killTree(child);
        resolve(hb.ti + 1);
      }
    }, 500);
    child.on('exit', (code) => {
      clearInterval(iv);
      if (settled) return;
      let hb = {};
      try { hb = JSON.parse(readFileSync(HB, 'utf8')); } catch {}
      if (hb.finished) return resolve(-1);
      if (hb.ti === undefined) {
        // died before its first task: nothing to resume from
        process.stdout.write(`\nthe sweep child exited (code ${code}) before timing anything — see the error above\n`);
        return resolve(-1);
      }
      process.stdout.write(`\nthe sweep child exited (code ${code}) in task ${hb.ti}; resuming at the next task\n`);
      resolve(hb.ti + 1);
    });
  });
}

const t0 = Date.now();
let next = Number(args.arg('--from', 0));
while (next >= 0) next = await runFrom(next);
console.log(`\nsweep done in ${((Date.now() - t0) / 60000).toFixed(1)} min → ${rel(OUT)}`);
spawnSync(process.execPath, [path.join(HERE, 'analyze3.mjs'), '--out', OUT_DIR, ...(subset ? ['--in', OUT, '--list'] : [])], { cwd: REPO, stdio: 'inherit' });
if (!existsSync(OUT)) process.exit(1);
