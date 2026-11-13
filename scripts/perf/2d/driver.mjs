// 2-D TIMING SWEEP — the entry point of the 2-D long-wait harness (#2867).
//
// WHAT IT MEASURES. How long the 2-D App makes a student wait for each action — submit a line, «הציגו תצורה אחרת»,
// load a saved figure, delete a row, and the background detect — by replaying real sequences through the real 2-D
// code (perf2d.ts has the per-slice breakdown: main thread / worker / background). Corpora: known slow issue
// sequences, src/__tests__/fixtures, the scenario corpus, prod sessions (logs/perf-prod-events.jsonl, else
// logs/prod-events-2d.jsonl) and the operator's dev sessions (logs/debug-log.jsonl). A missing log is "no data".
// No LLM call is ever made: perf2d.ts stubs fetch and drives only the deterministic lane.
//
// RUN (from the repo root):
//   node scripts/perf/2d/driver.mjs                                   full sweep — about 2 hours
//   node scripts/perf/2d/driver.mjs --only fixture:2022-summer-a-issue59.geo.json,issue:2513     a few items — under a minute each
//   node scripts/perf/2d/driver.mjs --sources fixture,issue           only those corpora (issue|fixture|prod|debug|scenario)
// then  node scripts/perf/2d/confirm.mjs   (re-measure every ≥3 s action twice, alone, + profile it — about 1 hour)
//       node scripts/perf/2d/profile.mjs "item:si:k"   (one action's CPU profile + summary)
//       node scripts/perf/2d/analyze.mjs   (counts, the slow table, measurements.json — seconds; the sweep runs it at the end)
// Options: --out <dir> (default reports/perf/2d) · --from I --to J (item index range) · --limit-ms N (default 60000)
//          --no-build (reuse <out>/jobs.json) · --no-scenarios (skip the scenario corpus) ·
//          --prod <events.jsonl> · --debug <debug-log.jsonl> (other log files than the defaults)
//
// WRITES (all under <out>, gitignored — jobs.json and the results carry prod utterances, never commit them):
//   scenarios.json, jobs.json   the built work list (item index = position in jobs.json)
//   results.jsonl               one record per timed action (a full sweep; the previous one moves to previous/)
//   only.jsonl                  the same, for an --only / --from / --to subset run (replaced each time)
//   + analyze.mjs outputs       confirm-targets.txt, measurements.json, counts.md, tableA.md
//
// ITEM INDICES (the "itemIdx:si" that confirm.mjs / profile.mjs take) are positions in jobs.json. Every run rebuilds
// jobs.json from the inputs, so they are stable until a fixture, scenario or log file changes; after such a change
// re-run the full sweep before confirming, or pass --no-build to keep working against the old list.
//
// WATCHDOG. ONE vite-node child at a time; an action silent for > limit is recorded as a timeout (">60 s"), the
// child is killed and the sweep restarts at the NEXT item.
//
// COMPARABILITY. Every number is a wall-clock timing: comparable only on a QUIET machine (no test suite, no dev
// server load), same machine, before vs after. The 2-D harness records no clock-free counter; the deterministic
// fields are `outcome` and `clipped` (a search budget was hit).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, rotate, viteNode, viteNodeSync, killTree, lineReader, commitStamp, REPO } from '../lib/common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.join(HERE, 'perf2d.ts');
const args = cli();
const OUT = outDir('2d', args);
const jobs = path.resolve(args.arg('--jobs', path.join(OUT, 'jobs.json')));
const only = args.arg('--only');
const LIMIT = Number(args.arg('--limit-ms', '60000'));
const subset = Boolean(only || args.has('--from') || args.has('--to'));
const out = path.join(OUT, subset ? 'only.jsonl' : 'results.jsonl');
const MODE = ['--mode', 'production'];

// ── build the work list ──
if (!args.has('--no-build')) {
  if (!args.has('--no-scenarios')) {
    const r = viteNodeSync(path.join(HERE, 'scenarios-export.ts'), ['--out', OUT], { viteOpts: [...MODE, '-c', path.join(HERE, 'vite.scenarios.config.mjs')] });
    process.stdout.write(r.stdout);
    if (r.status !== 0) process.stderr.write(`scenario export failed (the scenario corpus is skipped):\n${r.stderr.slice(-800)}\n`);
  }
  const build = ['--build', '--out', OUT, '--jobs', jobs];
  for (const k of ['--sources', '--prod', '--debug']) if (args.arg(k)) build.push(k, args.arg(k));
  if (args.has('--no-scenarios')) build.push('--scenarios', 'none');
  const r = viteNodeSync(HARNESS, build, { viteOpts: MODE });
  process.stdout.write(r.stdout);
  if (r.status !== 0) {
    process.stderr.write(r.stderr.slice(-2000) + '\nbuild failed\n');
    process.exit(1);
  }
}
if (!existsSync(jobs)) {
  console.log(`no data: ${rel(jobs)} not found — run without --no-build`);
  process.exit(1);
}
const items = JSON.parse(readFileSync(jobs, 'utf8'));
if (only) {
  const want = only.split(',');
  const missing = want.filter((id) => !items.some((it) => it.id === id));
  if (missing.length) console.log(`no data: no item named ${missing.join(', ')} (ids look like fixture:<file>, issue:<name>, scenario:<id>, prod:<sid>, debug:<session>)`);
  if (missing.length === want.length) process.exit(1);
}
let from = Number(args.arg('--from', '0'));
const to = Math.min(Number(args.arg('--to', String(items.length))), items.length);
if (subset) writeFileSync(out, '');
else {
  rotate(OUT, ['results.jsonl', 'confirm.jsonl', 'confirm-targets.txt', 'measurements.json', 'counts.md', 'tableA.md', 'prof', 'commit.txt']);
  writeFileSync(out, '');
  writeFileSync(path.join(OUT, 'commit.txt'), commitStamp() + '\n');
}
console.log(`${items.length} items in ${rel(jobs)}; sweeping ${only ? only : `items ${from}..${to - 1}`} → ${rel(out)}`);

function runFrom(start) {
  return new Promise((resolve) => {
    const a = ['--run', '--from', String(start), '--to', String(to), '--jobs', jobs, '--out', OUT];
    if (only) a.push('--only', only);
    const child = viteNode(HARNESS, a, { viteOpts: MODE });
    let cur = null; // { item, si, k }
    let lastItem = start - 1;
    let timer = null;
    let killed = false;
    let done = false;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!cur) return;
        const it = items[cur.item];
        appendFileSync(out, JSON.stringify({ item: it?.id, source: it?.source, user: it?.users, u: it?.steps[cur.si]?.u, itemIdx: cur.item, si: cur.si, k: cur.k.replace(/#.*/, ''), press: cur.k.includes('#') ? Number(cur.k.split('#')[1]) : undefined, timeout: true, total_ms: LIMIT, note: `>${LIMIT / 1000} s (killed)` }) + '\n');
        process.stderr.write(`TIMEOUT item ${cur.item} step ${cur.si} ${cur.k}\n`);
        killed = true;
        killTree(child);
      }, LIMIT);
    };
    child.stdout.on(
      'data',
      lineReader((line) => {
        if (line.startsWith('@@BEGIN ')) {
          const [, item, si, k] = line.split(' ');
          cur = { item: Number(item), si: Number(si), k };
          arm();
        } else if (line.startsWith('@@REC ')) {
          const rec = JSON.parse(line.slice(6));
          if (cur) rec.itemIdx = cur.item;
          appendFileSync(out, JSON.stringify(rec) + '\n');
          cur = null;
          clearTimeout(timer);
        } else if (line.startsWith('@@ITEM ')) {
          lastItem = Number(line.split(' ')[1]);
          if (subset || lastItem % 25 === 0) process.stderr.write(`${new Date().toISOString().slice(11, 19)} item ${lastItem}/${to} ${line.split(' ').slice(2).join(' ')}\n`);
        } else if (line === '@@DONE') done = true;
        else if (line.startsWith('no data')) console.log(line);
      }),
    );
    child.stderr.on('data', (d) => {
      const s = d.toString();
      if (/Error|error/.test(s)) process.stderr.write('[child] ' + s.slice(0, 400));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, killed, done, next: killed ? (cur ? cur.item : lastItem) + 1 : lastItem + 1 });
    });
  });
}

const t0 = Date.now();
while (from < to) {
  const r = await runFrom(from);
  if (r.done || (!r.killed && r.code === 0)) break;
  if (!r.killed) process.stderr.write(`child exited ${r.code}; restarting after item ${r.next - 1}\n`);
  from = r.next <= from ? from + 1 : r.next;
}
console.log(`sweep done in ${((Date.now() - t0) / 60000).toFixed(1)} min → ${rel(out)}`);

// ── counts + the slow list (and, for a full sweep, the confirm targets) ──
const { spawnSync } = await import('node:child_process');
spawnSync(process.execPath, [path.join(HERE, 'analyze.mjs'), '--out', OUT, ...(subset ? ['--in', out, '--list'] : [])], { cwd: REPO, stdio: 'inherit' });
