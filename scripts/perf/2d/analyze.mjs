// 2-D TIMING SUMMARY (#2867) — counts per action kind and wait bucket, the slow-action table, and the list of
// actions the confirm pass should re-measure. Generic: it clusters nothing and names no cause (profile for that).
//
// RUN (from the repo root; driver.mjs runs it at the end of every sweep):
//   node scripts/perf/2d/analyze.mjs                 summarise <out>/results.jsonl (+ <out>/confirm.jsonl when present)
//   node scripts/perf/2d/analyze.mjs --list          also print the 40 slowest actions
//   node scripts/perf/2d/analyze.mjs --in reports/perf/2d/only.jsonl --list     a subset run (writes nothing)
// Options: --out <dir> (default reports/perf/2d) · --min 3000 (ms: confirm threshold) · --table-min 5000 (ms: table A)
//
// WRITES under <out> (only when summarising the full sweep, i.e. without --in):
//   confirm-targets.txt   one line per item, "itemIdx:si,itemIdx:si" — every action ≥ --min (confirm.mjs reads it)
//   measurements.json     every timed action: sweep_ms, confirm_ms[], value_ms (= median of the isolated confirm
//                         runs when re-measured, else the sweep reading; a timeout counts as the watchdog limit)
//   counts.md             action kind (and kind @corpus) × wait bucket
//   tableA.md             every action ≥ --table-min: the utterance sequence, the wait, main/worker split, dominant slice
// Takes seconds. A missing results file is reported as "no data".
//
// COMPARABILITY: all values are wall-clock timings — compare runs only from a quiet machine. `clipped` (a 12 s
// search budget was hit) and `outcome` are deterministic and comparable anywhere.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cli, outDir, rel, readJsonl, median, countBuckets, countsText, countsMarkdown } from '../lib/common.mjs';

const args = cli();
const OUT = outDir('2d', args);
const given = args.arg('--in');
const IN = given ? path.resolve(given) : path.join(OUT, 'results.jsonl');
const MIN = Number(args.arg('--min', '3000'));
const TABLE_MIN = Number(args.arg('--table-min', '5000'));

const sweep = readJsonl(IN).filter((r) => !r.run);
if (!sweep.length) {
  console.log(`no data: ${rel(IN)} is missing or empty — run node scripts/perf/2d/driver.mjs first`);
  process.exit(0);
}
const conf = given ? [] : readJsonl(path.join(OUT, 'confirm.jsonl'));
const jobsFile = path.join(OUT, 'jobs.json');
const jobs = existsSync(jobsFile) ? JSON.parse(readFileSync(jobsFile, 'utf8')) : [];

const key = (r) => `${r.item}|${r.si}|${r.k}|${r.press ?? ''}`;
const confBy = new Map();
for (const r of conf) {
  if (!confBy.has(key(r))) confBy.set(key(r), []);
  confBy.get(key(r)).push(r);
}
const slices = (r) => ({
  prefold: (r.prefold_worker ?? 0) + (r.post_prefold_worker ?? 0),
  decide: r.decide_main ?? 0,
  autoResolve: (r.autoResolve_worker ?? 0) + (r.post_autoResolve_worker ?? 0),
  postLLM: (r.post_dryrun_main ?? 0) + (r.post_commit_main ?? 0),
  render: (r.render_main ?? 0) + (r.render2_main ?? 0) + (r.post_render_main ?? 0),
  load: r.load_main ?? 0,
  resample: r.resample_worker ?? 0,
  detect: r.detect_bg ?? 0,
});

const all = [];
for (const r of sweep) {
  if (r.error) {
    all.push(r);
    continue;
  }
  const c = confBy.get(key(r)) ?? [];
  // a re-run under 10 % of the other is an identity-cache artefact of re-using the same anchored objects in one
  // process (two debug presses on one figure) — dropped
  let runs = c.map((x) => x.total_ms).filter((v) => typeof v === 'number');
  if (runs.length >= 2) {
    const mx = Math.max(...runs);
    runs = runs.filter((v) => v >= 0.1 * mx);
  }
  const med = median(runs);
  const base = c[c.length - 1] ?? r;
  const sl = slices(base);
  const top = Object.entries(sl).sort((x, y) => y[1] - x[1])[0];
  all.push({ ...r, sweep_ms: r.total_ms, confirm_ms: runs, value_ms: med ?? r.total_ms ?? 0, clipped: Boolean(base.clipped || r.clipped), main_ms: base.main_ms ?? r.main_ms, worker_ms: base.worker_ms ?? r.worker_ms, dominant: top[1] > 0 ? top[0] : '?' });
}
const timed = all.filter((r) => !r.error);
const counts = countBuckets(timed, (r) => [r.k, `${r.k} @${r.source ?? r.item?.split(':')[0] ?? '?'}`], (r) => r.value_ms);
console.log(countsText(counts, 'action'));
console.log(`actions ${timed.length}  errors ${all.length - timed.length}  timeouts ${timed.filter((r) => r.timeout).length}  re-measured ${timed.filter((r) => r.confirm_ms.length).length}`);

const slowOf = (r) => Math.max(r.value_ms, (r.post_main_ms ?? 0) + (r.post_worker_ms ?? 0));
const slow = timed.filter((r) => slowOf(r) >= MIN).sort((a, b) => slowOf(b) - slowOf(a));
console.log(`actions ≥ ${MIN} ms: ${slow.length}`);
if (args.has('--list')) {
  for (const r of [...timed].sort((a, b) => slowOf(b) - slowOf(a)).slice(0, 40))
    console.log(String(Math.round(r.value_ms)).padStart(8), 'ms', String(r.k + (r.press ? '#' + r.press : '')).padEnd(10), `${r.itemIdx}:${r.si}`.padEnd(9), r.item ?? '', '|', r.u ?? '', '|', r.outcome ?? (r.timeout ? 'TIMEOUT' : ''), r.clipped ? 'CLIPPED' : '', `main ${r.main_ms ?? '?'} worker ${r.worker_ms ?? '?'}`, r.post_main_ms !== undefined ? `post-LLM main ${r.post_main_ms} worker ${r.post_worker_ms}` : '');
  for (const r of all.filter((x) => x.error).slice(0, 10)) console.log('ERROR', r.item, r.si, String(r.error).slice(0, 200));
}
if (given) process.exit(0); // a subset run is printed, never written over the full sweep's files

// ── confirm targets ──
const targets = new Map();
for (const r of slow) {
  if (r.itemIdx === undefined) continue;
  if (!targets.has(r.itemIdx)) targets.set(r.itemIdx, new Set());
  targets.get(r.itemIdx).add(r.si);
}
writeFileSync(path.join(OUT, 'confirm-targets.txt'), [...targets].map(([i, s]) => [...s].map((si) => `${i}:${si}`).join(',')).join('\n') + (targets.size ? '\n' : ''));

// ── measurements.json, counts.md ──
const commitFile = path.join(OUT, 'commit.txt');
writeFileSync(
  path.join(OUT, 'measurements.json'),
  JSON.stringify({
    generated: new Date().toISOString(),
    commit: existsSync(commitFile) ? readFileSync(commitFile, 'utf8').trim() : 'unknown',
    note: 'every timed action; value_ms = median of the isolated confirm runs when re-measured, else the sweep reading; timeout = killed by the watchdog',
    actions: all.map(({ trail: _t, ...r }) => r),
  }),
);
writeFileSync(path.join(OUT, 'counts.md'), countsMarkdown(counts, 'action'));

// ── table A: every action ≥ TABLE_MIN, with the sequence that leads to it ──
const uniq = (a) => a.filter((v, i) => v && a.indexOf(v) === i);
function sequence(r) {
  const it = jobs[r.itemIdx];
  const st = it?.steps?.[r.si];
  if (st?.before) return { prior: uniq(st.before.facts.map((f) => f.utterance)), anchored: true };
  if (it) return { prior: it.steps.slice(0, r.si).filter((s) => s.k === 'submit').map((s) => s.u), anchored: false };
  return { prior: r.trail ?? [], anchored: false };
}
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const fmt = (ms) => Math.round(ms ?? 0).toLocaleString('en-US').replace(/,/g, ' ');
const rows = timed.filter((r) => r.value_ms >= TABLE_MIN).sort((a, b) => b.value_ms - a.value_ms);
const md = ['| # | action | sequence (slow step in **bold**; ⚓ = measured on the logged figure) | ms | re-measured | main ms | worker ms | dominant slice | budget | source | item:step |', '|---|---|---|---|---|---|---|---|---|---|---|'];
rows.forEach((r, i) => {
  const { prior, anchored } = sequence(r);
  const shown = prior.length > 10 ? ['…', ...prior.slice(-10)] : prior;
  const act = r.k === 'submit' ? `**${esc(r.u)}**` : r.k === 'another' ? `**[«הציגו תצורה אחרת» press ${r.press ?? 1}]**` : r.k === 'load' ? '**[load the figure cold]**' : r.k === 'delete' ? '**[delete a row]**' : '**[background detect]**';
  const src = r.source === 'prod' ? `prod ${String(r.item).slice(5)} (user ${String(r.user).slice(0, 6)})` : r.source === 'debug' ? `debug ${String(r.item).slice(6)}${r.occ > 1 ? ` ×${r.occ}` : ''}` : `${r.source} ${String(r.item).replace(/^[a-z]+:/, '')}`;
  const ms = r.timeout && !r.confirm_ms.length ? `>${fmt(r.total_ms)}` : fmt(r.value_ms);
  const re = r.confirm_ms.length ? r.confirm_ms.map(fmt).join(', ') : 'sweep only';
  md.push(`| ${i + 1} | ${r.k}${r.press ? ' #' + r.press : ''} | ${(anchored ? '⚓ ' : '') + [...shown.map(esc), act].join(' · ')} | ${ms} | ${re} | ${fmt(r.main_ms)} | ${fmt(r.worker_ms)} | ${r.k === 'detect' ? 'detect (bg)' : r.dominant} | ${r.clipped ? '12 s budget hit' : r.timeout ? 'watchdog' : ''} | ${esc(src)} | ${r.itemIdx}:${r.si} |`);
});
writeFileSync(path.join(OUT, 'tableA.md'), md.join('\n') + '\n');
console.log(`wrote ${rel(OUT)}/: confirm-targets.txt (${targets.size} items), measurements.json, counts.md, tableA.md (${rows.length} rows ≥ ${TABLE_MIN} ms)`);
if (targets.size && !conf.length) console.log('next: node scripts/perf/2d/confirm.mjs');
