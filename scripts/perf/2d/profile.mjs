// 2-D PROFILE STEP (#2867) — a CPU profile of ONE student action, and where its time goes. (Replaces profile-all.sh.)
//
// WHAT IT DOES. Per target, one fresh vite-node process rebuilds the item's prefix untimed, then samples ONLY the
// target action (500 µs interval) and summarises the profile: top functions by self and by inclusive time, with
// source file:line. No LLM: it runs perf2d.ts, which stubs fetch and drives only the deterministic lane.
//
// RUN (from the repo root, after driver.mjs has built <out>/jobs.json):
//   node scripts/perf/2d/profile.mjs "12:9:submit"                 item 12, step 9 (analyze.mjs --list prints item:step)
//   node scripts/perf/2d/profile.mjs "40:3:another#2" "5:2:load"   k = submit | another | another#N | load | delete | detect
// Options: --out <dir> (default reports/perf/2d) · --top 30 · --under <function> · --timeout-s 900 (per target)
//
// WRITES under <out>/prof: <item>-<si>-<k>.cpuprofile (open in Chrome DevTools → Performance), .rec (the timing
// record of that run) and .txt (the summary, also printed). About the action's own duration plus ~15 s start-up.
//
// COMPARABILITY: the % columns are comparable anywhere; the ms column (and the record) only on a quiet machine.
// Profiling itself adds roughly 10–30 %.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, viteNodeSync } from '../lib/common.mjs';
import { profsum } from '../lib/profsum.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = cli();
const OUT = outDir('2d', args);
const jobs = path.resolve(args.arg('--jobs', path.join(OUT, 'jobs.json')));
const PROF = path.join(OUT, 'prof');
const targets = args.positional(['--out', '--jobs', '--top', '--under', '--timeout-s']);
if (!targets.length) {
  console.log('usage: node scripts/perf/2d/profile.mjs "itemIdx:si:k" …   (k = submit | another | another#N | load | delete | detect)');
  process.exit(1);
}
if (!existsSync(jobs)) {
  console.log(`no data: ${rel(jobs)} not found — run node scripts/perf/2d/driver.mjs first`);
  process.exit(0);
}
mkdirSync(PROF, { recursive: true });
for (const t of targets) {
  const [it, si, k] = t.split(':');
  if (k === undefined) {
    console.log(`skipped ${t}: a target is "itemIdx:si:k"`);
    continue;
  }
  const base = path.join(PROF, `${it}-${si}-${k.replace('#', '_')}`);
  const r = viteNodeSync(path.join(HERE, 'perf2d.ts'), ['--confirm', `${it}:${si}`, '--runs', '1', '--profile', t, '--prof-dir', PROF, '--jobs', jobs, '--out', OUT], { viteOpts: ['--mode', 'production'], timeout: Number(args.arg('--timeout-s', '900')) * 1000 });
  const want = k.includes('#') ? Number(k.split('#')[1]) : undefined;
  const rec = r.stdout.split('\n').filter((l) => l.startsWith('@@REC ')).map((l) => JSON.parse(l.slice(6))).find((x) => x.si === Number(si) && (want === undefined || x.press === want));
  if (rec) writeFileSync(base + '.rec', JSON.stringify(rec) + '\n');
  if (!existsSync(base + '.cpuprofile')) {
    console.log(`no data: ${t} wrote no profile${r.timedOut ? ' (timed out)' : ''} — is "${k}" the action that step ${si} of item ${it} runs? ${r.stderr.trim().split('\n').pop() ?? ''}`);
    continue;
  }
  const head = rec ? `${rec.item} step ${rec.si} ${rec.k}${rec.press ? '#' + rec.press : ''} — ${rec.total_ms} ms (main ${rec.main_ms}, worker ${rec.worker_ms}) ${rec.outcome ?? ''}${rec.u ? ' | ' + rec.u : ''}\n` : '';
  const text = head + profsum(base + '.cpuprofile', { top: Number(args.arg('--top', '30')), under: args.arg('--under') });
  writeFileSync(base + '.txt', text + '\n');
  console.log(`\n### ${t} → ${rel(base)}.{cpuprofile,rec,txt}\n${text}`);
}
