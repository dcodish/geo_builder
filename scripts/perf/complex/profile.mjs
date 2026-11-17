// COMPLEX-NUMBERS PROFILE STEP (#2867) — a CPU profile of ONE student action, and where its time goes. (New as a
// script: the session profiled by hand with `node --cpu-prof`, which also sampled start-up and the build-up.)
//
// WHAT IT DOES. Per target, one fresh vite-node process replays the item's earlier lines untimed, then samples ONLY
// the target action (500 µs interval) and summarises the profile: top functions by self and by inclusive time, with
// source file:line. No LLM (harness.ts: decideSubmitCx only + a fetch stub).
//
// RUN (from the repo root):
//   node scripts/perf/complex/profile.mjs "probe:roots-deg36@submit#1"     <item id>@<action>
//       <action> = submit#<step> | another#<1..6> | load | edit | delete   (sweep.mjs prints item@action per row)
//   node scripts/perf/complex/profile.mjs --slowest 5                       the 5 slowest actions of measurements.json
// Options: --out <dir> (default reports/perf/complex) · --in <measurements.json | only.json> (for --slowest) ·
//          --top 30 · --under <function> · --limit-ms 600000 (per target)
//
// WRITES under <out>/prof: <item>-<action>.cpuprofile (open in Chrome DevTools → Performance) and .txt (the action's
// record + the summary, also printed). About the action's own duration plus ~10 s start-up, per target.
//
// COMPARABILITY: the % columns are comparable anywhere; ms values only on a quiet machine. Profiling adds ~10–30 %.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, safeName, viteNodeSync } from '../lib/common.mjs';
import { profsum } from '../lib/profsum.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = cli();
const OUT = outDir('complex', args);
const PROF = path.join(OUT, 'prof');

let targets = args.positional(['--out', '--in', '--top', '--under', '--limit-ms', '--slowest']).map((t) => {
  const at = t.lastIndexOf('@');
  return at > 0 ? [t.slice(0, at), t.slice(at + 1)] : null;
});
if (targets.includes(null)) {
  console.log('a target is "<item id>@<action>", e.g. "probe:roots-deg36@submit#1" (action = submit#N | another#N | load | edit | delete)');
  process.exit(1);
}
if (args.has('--slowest')) {
  const f = path.resolve(args.arg('--in', path.join(OUT, 'measurements.json')));
  if (!fs.existsSync(f)) console.log(`no data: ${rel(f)} not found — run node scripts/perf/complex/sweep.mjs first`);
  else {
    const ms = (m) => (typeof m.confirmedMs === 'number' ? m.confirmedMs : typeof m.ms === 'number' ? m.ms : 0);
    const rows = JSON.parse(fs.readFileSync(f, 'utf8')).rows.filter((m) => !m.timeout);
    targets = targets.concat(rows.sort((a, b) => ms(b) - ms(a)).slice(0, Number(args.arg('--slowest', '5'))).map((m) => [m.item, m.kind === 'load' || m.kind === 'edit' || m.kind === 'delete' ? m.kind : `${m.kind}#${m.step}`]));
  }
}
if (!targets.length) {
  console.log('usage: node scripts/perf/complex/profile.mjs "<item id>@<action>" …   |   --slowest N');
  process.exit(args.has('--slowest') ? 0 : 1);
}
fs.mkdirSync(PROF, { recursive: true });
for (const [id, action] of targets) {
  const base = path.join(PROF, `${safeName(id)}-${safeName(action)}`);
  fs.rmSync(base + '.cpuprofile', { force: true });
  const r = viteNodeSync(path.join(HERE, 'harness.ts'), ['--id', id, '--only', action, '--prof', base + '.cpuprofile'], { timeout: Number(args.arg('--limit-ms', '600000')) });
  const lines = r.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
  if (!fs.existsSync(base + '.cpuprofile')) {
    console.log(`no data: ${id}@${action} wrote no profile — ${r.timedOut ? 'timed out' : lines.some((o) => o.ev === 'nodata') ? 'no corpus item has that id' : 'that item has no such action'} ${r.stderr.trim().split('\n').pop() ?? ''}`);
    continue;
  }
  const rec = lines.find((o) => o.ev === 'm');
  const text = `${id}@${action}\n${rec ? JSON.stringify(rec) + '\n' : ''}` + profsum(base + '.cpuprofile', { top: Number(args.arg('--top', '30')), under: args.arg('--under') });
  fs.writeFileSync(base + '.txt', text + '\n');
  console.log(`\n### ${id}@${action} → ${rel(base)}.{cpuprofile,txt}\n${text}`);
}
