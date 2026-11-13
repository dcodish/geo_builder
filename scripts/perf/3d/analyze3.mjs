// 3-D TIMING SUMMARY (#2867) — counts per action kind and wait bucket, and the slow-action table. Generic: it
// clusters nothing and names no cause (profile for that). (Folds the session's analyze3.mjs + tableA.mjs.)
//
// RUN (from the repo root; drive3.mjs and confirm3.mjs run it at their end):
//   node scripts/perf/3d/analyze3.mjs                 summarise <out>/results.jsonl (+ <out>/confirm.jsonl when present)
//   node scripts/perf/3d/analyze3.mjs --list          also print the 40 slowest actions
//   node scripts/perf/3d/analyze3.mjs --in reports/perf/3d/only.jsonl --list      a subset run (writes nothing)
// Options: --out <dir> (default reports/perf/3d) · --table-min 5000 (ms: table A)
//
// WRITES under <out> (only when summarising the full sweep, i.e. without --in):
//   measurements.json   every swept action, with `confirmed` { runs, median, resolves, lmSolves, lmEvals } when re-measured
//   counts.md           action kind (and kind @corpus) × wait bucket, on the confirmed number where there is one
//   tableA.md           every action ≥ --table-min: the utterance sequence, the wait, decide/render split, the counters
// Takes seconds. A missing results file is reported as "no data".
//
// COMPARABILITY: ms values are wall-clock timings — compare runs only from a quiet machine. `resolves`, `lmSolves`,
// `lmEvals` (and `uncached`) are clock-free counters: comparable on any machine, under any load.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cli, outDir, rel, readJsonl, countBuckets, countsText, countsMarkdown } from '../lib/common.mjs';

const args = cli();
const OUT = outDir('3d', args);
const given = args.arg('--in');
const IN = given ? path.resolve(given) : path.join(OUT, 'results.jsonl');
const TABLE_MIN = Number(args.arg('--table-min', '5000'));

const sweep = readJsonl(IN);
if (!sweep.length) {
  console.log(`no data: ${rel(IN)} is missing or empty — run node scripts/perf/3d/drive3.mjs first`);
  process.exit(0);
}
const conf = given ? [] : readJsonl(path.join(OUT, 'confirm.jsonl'));
const ckey = (r) => `${r.task}#${r.ai}`;
const cm = new Map(conf.map((r) => [ckey(r), r]));
const best = (r) => cm.get(ckey(r))?.median ?? r.ms;
const counts = countBuckets(sweep, (r) => [r.kind, `${r.kind} @${r.corpus}`], best);
console.log(countsText(counts, 'action'));
console.log(`actions ${sweep.length}  timeouts ${sweep.filter((r) => r.timeout).length}  re-measured ${sweep.filter((r) => cm.has(ckey(r))).length}`);

const seq = (r, n) => `${(n ? (r.prior ?? []).slice(-n) : r.prior ?? []).join(' · ')} ⟹ ${r.kind === 'another' ? '(press)' : r.kind === 'load' ? '(load)' : r.utterance ?? ''}`;
if (args.has('--list')) {
  console.log('\n      ms  decide  render  resolves  lmSolves/lmEvals  kind      task#action');
  for (const r of [...sweep].sort((a, b) => best(b) - best(a)).slice(0, 40))
    console.log(String(best(r)).padStart(8), String(r.decideMs ?? '').padStart(7), String(r.renderMs ?? '').padStart(7), String(r.resolves ?? '').padStart(9), `${r.lmSolves ?? ''}/${r.lmEvals ?? ''}`.padStart(17), ' ' + r.kind.padEnd(9), `${r.task}@${r.ai}`, '|', seq(r, 2), '|', r.verdict ?? '');
}
if (given) process.exit(0); // a subset run is printed, never written over the full sweep's files

const commitFile = path.join(OUT, 'commit.txt');
const measurements = sweep.map((r) => {
  const c = cm.get(ckey(r));
  return { ...r, confirmed: c ? { runs: c.runs, median: c.median, resolves: c.resolves, lmSolves: c.lmSolves, lmEvals: c.lmEvals } : undefined };
});
writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify({ generated: new Date().toISOString(), commit: existsSync(commitFile) ? readFileSync(commitFile, 'utf8').trim() : 'unknown', note: 'ms = warm sweep (one long process); confirmed.median = mean of two fresh-process runs of the whole task; resolves/lmSolves/lmEvals/uncached are clock-free', counts, measurements }));
writeFileSync(path.join(OUT, 'counts.md'), countsMarkdown(counts, 'action'));

// ── table A: every action ≥ TABLE_MIN on its best number (confirmed where re-measured) ──
const esc = (s) => String(s).split('|').join('\\|');
const avg = (xs) => {
  const v = (Array.isArray(xs) ? xs : [xs]).filter((x) => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : '';
};
const rows = sweep.filter((r) => best(r) >= TABLE_MIN).sort((a, b) => best(b) - best(a));
const md = ['| # | action | sequence (slow step **bold**; a press/load/delete acts on the whole list) | ms | fresh-process runs | warm sweep ms | decide ms | render ms | resolves | lmSolves / lmEvals | source | task@action |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
rows.forEach((r, i) => {
  const c = cm.get(ckey(r));
  const prior = (r.prior ?? []).map((s) => `«${esc(s)}»`).join(' · ');
  const step = r.kind === 'submit' || r.kind === 'llm-step' ? ` · **«${esc(r.utterance)}»**` : r.kind === 'delete' ? ` — **delete «${esc(r.utterance)}»**` : r.kind === 'another' ? ' — **press «הציגו תצורה אחרת»**' : ' — **load (cold)**';
  const src = r.task.replace(/^fx:/, 'fixture ').replace(/^prod:/, 'prod sid ').replace(/^dbg:/, 'debug session ').replace(/^issue:/, 'issue ');
  const n = c ?? r;
  md.push(`| ${i + 1} | ${r.kind} | ${prior}${step} | ${r.timeout && !c ? '>' + r.ms : best(r)} | ${c ? c.runs.join(', ') : r.timeout ? 'watchdog' : 'sweep only'} | ${r.ms} | ${avg(n.decideMs)} | ${avg(n.renderMs)} | ${n.resolves ?? ''} | ${n.lmSolves ?? ''} / ${n.lmEvals ?? ''} | ${esc(src)}${r.user ? ` (user ${String(r.user).slice(0, 6)})` : ''} | ${esc(r.task)}@${r.ai} |`);
});
writeFileSync(path.join(OUT, 'tableA.md'), md.join('\n') + '\n');
console.log(`wrote ${rel(OUT)}/: measurements.json, counts.md, tableA.md (${rows.length} rows ≥ ${TABLE_MIN} ms)`);
if (!conf.length && sweep.some((r) => r.ms >= 3000)) console.log('next: node scripts/perf/3d/confirm3.mjs');
