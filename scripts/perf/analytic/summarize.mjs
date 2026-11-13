// ANALYTIC TIMING SUMMARY (#2867) — counts per action kind, lane and wait bucket; the slow-action table; and the
// keys the confirm pass should re-measure. Generic: it clusters nothing and names no cause (profile for that).
// (Folds the session's summarize.mjs + tableA.mjs, without their cluster guesses.)
//
// RUN (from the repo root; driver.mjs and confirm.mjs run it at their end):
//   node scripts/perf/analytic/summarize.mjs                 summarise <out>/results.jsonl (+ <out>/confirm.json when present)
//   node scripts/perf/analytic/summarize.mjs --list          also print the 40 slowest actions
//   node scripts/perf/analytic/summarize.mjs --in reports/perf/analytic/only.jsonl --list      a subset run (writes nothing)
// Options: --out <dir> (default reports/perf/analytic) · --min 3000 (ms: confirm threshold) · --table-min 5000 (ms: table A)
//
// WRITES under <out> (only when summarising the full sweep, i.e. without --in):
//   measurements.json   every timed action with its pre-state and phases, + errors and timeouts
//   to-confirm.txt      one key per line: every action whose total ≥ --min (confirm.mjs reads it)
//   counts.md           action kind · lane × wait bucket
//   confirmed.json, tableA.md   (when confirm.json exists) per re-measured action the MEDIAN of its confirm runs per
//                       phase; table A lists every action ≥ --table-min on figure or total, with its sequence
// Takes seconds. A missing results file is reported as "no data".
//
// COMPARABILITY: phase values are wall-clock timings — compare runs only from a quiet machine. `poolSlices` and
// `verdict` are clock-free.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cli, outDir, rel, readJsonl, median, countBuckets, countsText, countsMarkdown } from '../lib/common.mjs';

const args = cli();
const OUT = outDir('analytic', args);
const given = args.arg('--in');
const src = given ? path.resolve(given) : path.join(OUT, 'results.jsonl');
const MIN = Number(args.arg('--min', '3000'));
const TABLE_MIN = Number(args.arg('--table-min', '5000'));

const rows = readJsonl(src);
if (!rows.length) {
  console.log(`no data: ${rel(src)} is missing or empty — run node scripts/perf/analytic/driver.mjs first`);
  process.exit(0);
}
const acts = rows.filter((r) => r.ph);
const errs = rows.filter((r) => r.error);
const tos = rows.filter((r) => r.timeout || r.crashed);
const LANES = [['figure (main)', (r) => r.ph.figure], ['post (main, after paint)', (r) => r.ph.post], ['to settled (all)', (r) => r.ph.total], ['longest pool slice', (r) => r.ph.poolMaxSlice]];
const counts = countBuckets(acts.flatMap((r) => LANES.map(([lane, v]) => ({ k: `${r.kind} · ${lane}`, v: v(r) }))), (x) => [x.k], (x) => x.v);
console.log(`actions ${acts.length}  errors ${errs.length}  timeouts/crashes ${tos.length}`);
console.log(countsText(counts, 'action · lane'));
const bySource = {};
for (const r of acts) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
console.log('by corpus', JSON.stringify(bySource));
const slow = acts.filter((r) => r.ph.total >= MIN).sort((a, b) => b.ph.total - a.ph.total);
console.log(`actions ≥ ${MIN} ms to settled: ${slow.length}`);
const f0 = (x) => (x ?? 0).toFixed(0);
if (args.has('--list')) {
  for (const r of [...acts].sort((a, b) => b.ph.total - a.ph.total).slice(0, 40))
    console.log(f0(r.ph.total).padStart(7), 'ms', r.kind.padEnd(10), String(r.ph.verdict ?? '').padEnd(10), `figure ${f0(r.ph.figure)} (decide ${f0(r.ph.decide)} render ${f0(r.ph.render)}) post ${f0(r.ph.post)} pool ${f0(r.ph.pool)}/${r.ph.poolSlices} slices settle ${f0(r.ph.settle)}`, '|', r.key, '|', (r.utterance ?? '').slice(0, 50), '| lines before:', r.pre.lines.length);
}
for (const e of errs.slice(0, 10)) console.log('ERR', e.source, e.id, String(e.error).slice(0, 200));
for (const t of tos) console.log('TIMEOUT/CRASH', JSON.stringify(t));
if (given) process.exit(0); // a subset run is printed, never written over the full sweep's files

const commitFile = path.join(OUT, 'commit.txt');
fs.writeFileSync(path.join(OUT, 'to-confirm.txt'), slow.map((r) => r.key).join('\n') + (slow.length ? '\n' : ''));
const actions = acts.map(({ job, source, id, iph, step, kind, utterance, index, pre, ph, key }) => ({ key, job, source, id, iph, step, kind, utterance, index, preLines: pre.lines, preSeed: pre.seed, preHosts: pre.hosts, ph }));
fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify({ generated: new Date().toISOString(), commit: fs.existsSync(commitFile) ? fs.readFileSync(commitFile, 'utf8').trim() : 'unknown', actions, errors: errs, timeouts: tos }));
fs.writeFileSync(path.join(OUT, 'counts.md'), countsMarkdown(counts, 'action · lane'));
const wrote = ['measurements.json', `to-confirm.txt (${slow.length} keys)`, 'counts.md'];

// ── the confirm pass, merged: per re-measured action the median of its runs, per phase ──
const confFile = path.join(OUT, 'confirm.json');
if (fs.existsSync(confFile)) {
  const conf = JSON.parse(fs.readFileSync(confFile, 'utf8'));
  const byKey = new Map(actions.map((a) => [a.key, a]));
  const confirmed = [];
  for (const [k, reps] of Object.entries(conf)) {
    const a = byKey.get(k);
    if (!a || !reps.length) continue;
    const f = (x) => median(reps.map((r) => r[x]));
    const ph = { decide: f('decide'), render: f('render'), figure: f('figure'), post: f('post'), pool: f('pool'), poolSlices: reps[0].poolSlices, poolMaxSlice: f('poolMaxSlice'), settle: f('settle'), total: f('total') };
    const dominant = Object.entries({ decide: ph.decide, render: ph.render, post: ph.post, pool: ph.pool, settle: ph.settle }).sort((x, y) => y[1] - x[1])[0][0];
    confirmed.push({ key: k, source: a.source, id: a.id, iph: a.iph, step: a.step, kind: a.kind, utterance: a.utterance, preLines: a.preLines, verdict: reps[0].verdict ?? '', ph, runs: reps.map((r) => Math.round(r.total)), dominant, sweep: a.ph.total });
  }
  confirmed.sort((x, y) => Math.max(y.ph.figure, y.ph.total) - Math.max(x.ph.figure, x.ph.total));
  fs.writeFileSync(path.join(OUT, 'confirmed.json'), JSON.stringify(confirmed, null, 1));
  const s = (ms) => (ms / 1000).toFixed(1);
  const bar = (t) => String(t ?? '').replace(/\|/g, '/');
  const md = ['| # | action | sequence (slow step ⟶) | confirm median: figure (main) s | to settled s | runs (total ms) | sweep s | lanes | dominant | source | key |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  let i = 0;
  for (const r of confirmed.filter((x) => Math.max(x.ph.figure, x.ph.total) >= TABLE_MIN)) {
    i += 1;
    const seq = r.preLines.map(bar).join(' · ');
    const step = r.kind === 'another' ? '«הציגו תצורה אחרת»' : r.kind === 'load' ? '(load file)' : r.kind === 'delete' ? `✕ delete «${bar(r.utterance)}»` : `«${bar(r.utterance)}»`;
    const lanes = `decide ${s(r.ph.decide)} · render ${s(r.ph.render)} · post ${s(r.ph.post)} · bg pool ${s(r.ph.pool)} (${r.ph.poolSlices} slices, longest ${s(r.ph.poolMaxSlice)}) · settle ${s(r.ph.settle)}`;
    const from = (r.source === 'prod' ? `prod sid ${r.id} (user ${String(r.iph).slice(0, 6)})` : `${r.source} ${bar(r.id)}`) + ` · step ${r.step}`;
    md.push(`| ${i} | ${r.kind}${r.verdict ? ` (${r.verdict})` : ''} | ${seq}${seq ? ' · ' : ''}⟶ ${step} | ${s(r.ph.figure)} | ${s(r.ph.total)} | ${r.runs.join(', ')} | ${s(r.sweep)} | ${lanes} | ${r.dominant} | ${from} | ${bar(r.key)} |`);
  }
  fs.writeFileSync(path.join(OUT, 'tableA.md'), md.join('\n') + '\n');
  wrote.push(`confirmed.json (${confirmed.length})`, `tableA.md (${i} rows ≥ ${TABLE_MIN} ms)`);
}
console.log(`wrote ${rel(OUT)}/: ${wrote.join(', ')}`);
if (slow.length && !fs.existsSync(confFile)) console.log('next: node scripts/perf/analytic/confirm.mjs');
