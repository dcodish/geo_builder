// COMPLEX-NUMBERS TIMING SWEEP — the entry point of the complex builder's long-wait harness (#2867). It sweeps,
// confirms and summarises in one go (the complex corpus is small).
//
// WHAT IT MEASURES. How long the complex App makes a student wait for each action — submit a line, «הציגו תצורה
// אחרת», load a saved figure, edit or delete a row — by replaying real sequences through the real complex code, all
// on the main thread (harness.ts has the breakdown). Corpora: src-complex/__tests__/fixtures, prod sessions
// (logs/perf-prod-events-complex.jsonl, else logs/prod-events-complex.jsonl), the operator's dev sessions
// (logs/debug-log-complex.jsonl) and hand-authored scaling probes. A missing log is "no data". No LLM call is ever
// made (harness.ts: decideSubmitCx only + a fetch stub).
//
// RUN (from the repo root):
//   node scripts/perf/complex/sweep.mjs                                   full sweep + confirm — about 1 minute, plus two solo runs per action ≥ 3 s
//   node scripts/perf/complex/sweep.mjs --only "fixture:2b-capstone,probe:roots-deg36"     a few items — seconds each
//   node scripts/perf/complex/sweep.mjs --summarize                       re-print the last sweep's summary (no run)
// then  node scripts/perf/complex/profile.mjs "<item id>@<action>"   (one action's CPU profile + summary; or --slowest 5)
// Options: --out <dir> (default reports/perf/complex) · --min 3000 (ms: confirm threshold) · --no-confirm ·
//          --table-min 5000 (ms: table A) · --limit-ms N (default 60000) ·
//          --prod <events.jsonl> · --debug <debug-log.jsonl> (other log files than the defaults)
//
// WRITES (all under <out>, gitignored — the measurements carry prod utterances, never commit them):
//   measurements.json   every timed action (a full sweep; the previous one moves to previous/); an action ≥ --min
//                       carries `confirm` (two SOLO runs, each in a fresh process) and `confirmedMs` (their median)
//   only.json           the same, for an --only subset run (replaced each time)
//   counts.md, tableA.md   action kind (and kind @corpus) × wait bucket; every action ≥ --table-min with its sequence
//
// WATCHDOG. ONE vite-node child at a time; a child silent for the limit is killed, the in-flight action recorded as
// ">60 s", and the sweep resumes at the next corpus item.
//
// COMPARABILITY. Every `ms` is a wall-clock timing: comparable only on a QUIET machine, same machine, before vs
// after. `work` (the work meter's three counts, #2873: all the solver work, the part on the page, the part before the paint)
// is clock-free and comparable anywhere; `verdict` and `nLines` are deterministic too.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, outDir, rel, rotate, viteNode, killTree, lineReader, median, commitStamp, passThrough, countBuckets, countsText, countsMarkdown, workText, workSummary } from '../lib/common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.join(HERE, 'harness.ts');
const args = cli();
const OUT = outDir('complex', args);
const only = args.arg('--only');
const LIMIT = Number(args.arg('--limit-ms', '60000'));
const STARTUP_GRACE = 120_000;
const MIN = Number(args.arg('--min', '3000'));
const TABLE_MIN = Number(args.arg('--table-min', '5000'));
const outFile = path.join(OUT, only ? 'only.json' : 'measurements.json');

function runChild(a) {
  return new Promise((resolve) => {
    const ch = viteNode(HARNESS, [...a, ...passThrough(args, ['--prod', '--debug'])]);
    const rows = [];
    let inflight = null;
    let lastItem = null;
    let list = null;
    let nodata = null;
    let timer;
    let killed = false;
    const arm = (ms = LIMIT) => { clearTimeout(timer); timer = setTimeout(() => { killed = true; killTree(ch); }, ms); };
    arm(Math.max(LIMIT, STARTUP_GRACE)); // until its first line the child is starting up (transform + corpora + warm-up), not hung in an action
    ch.stdout.on(
      'data',
      lineReader((line) => {
        if (!line.startsWith('{')) return;
        let o; try { o = JSON.parse(line); } catch { return; }
        arm();
        if (o.ev === 'begin') inflight = o;
        else if (o.ev === 'm') { rows.push(o); inflight = null; }
        else if (o.ev === 'item') lastItem = o;
        else if (o.ev === 'list') list = o.items;
        else if (o.ev === 'nodata') nodata = o;
      }),
    );
    ch.stderr.on('data', (d) => process.stderr.write(d));
    ch.on('close', () => { clearTimeout(timer); resolve({ rows, inflight, lastItem, killed, list, nodata }); });
  });
}

const msOf = (m) => (typeof m.confirmedMs === 'number' ? m.confirmedMs : typeof m.ms === 'number' ? m.ms : LIMIT);

function summarize(doc, write) {
  const rows = doc.rows;
  if (!rows.length) return console.log('no data: no action was timed');
  const counts = countBuckets(rows, (m) => [m.kind, `${m.kind} @${m.source ?? m.item?.split(':')[0] ?? '?'}`], msOf);
  console.log(countsText(counts, 'action'));
  console.log(`items ${doc.items}  actions ${rows.length}  timeouts ${rows.filter((m) => m.timeout).length}  re-measured ${rows.filter((m) => m.confirm).length}  slowest ${Math.round(Math.max(...rows.map(msOf)))} ms  (commit ${doc.commit ?? 'unknown'})`);
  console.log(workSummary(rows, 'line reads + exact solves'));
  console.log('\n      ms  action      item@action | last line | verdict | parts | work');
  for (const m of [...rows].sort((a, b) => msOf(b) - msOf(a)).slice(0, only || args.has('--list') ? 40 : 12))
    console.log(String(Math.round(msOf(m))).padStart(8), ' ' + `${m.kind}#${m.step}`.padEnd(11), `${m.item}@${actionOf(m)}`, '|', (m.seq ?? []).at(-1) ?? '', '|', m.verdict ?? '', '|', JSON.stringify(m.parts ?? {}), '|', workText(m.work), m.confirm ? `confirm ${JSON.stringify(m.confirm)}` : '');
  if (!write) return;
  fs.writeFileSync(path.join(OUT, 'counts.md'), countsMarkdown(counts, 'action'));
  const esc = (t) => String(t ?? '').replace(/\|/g, '\\|');
  const md = ['| # | action | sequence (the action is on the LAST line for a submit; otherwise on the whole list) | ms | solo runs | parts (ms) | work units · on the page · before paint | lines | source | item@action |', '|---|---|---|---|---|---|---|---|---|---|'];
  const slow = rows.filter((m) => msOf(m) >= TABLE_MIN).sort((a, b) => msOf(b) - msOf(a));
  slow.forEach((m, i) => {
    const seq = (m.seq ?? []).map(esc);
    if (m.kind === 'submit' && seq.length) seq[seq.length - 1] = `**${seq[seq.length - 1]}**`;
    const act = m.kind === 'submit' ? '' : m.kind === 'another' ? ` — **press «הציגו תצורה אחרת» ×${m.step}**` : ` — **${m.kind}**`;
    md.push(`| ${i + 1} | ${m.kind}${m.verdict ? ` (${esc(m.verdict)})` : ''} | ${seq.join(' · ')}${act} | ${m.timeout && !m.confirm ? '>' + LIMIT : Math.round(msOf(m))} | ${m.confirm ? m.confirm.join(', ') : m.timeout ? 'watchdog' : 'sweep only'} | ${esc(Object.entries(m.parts ?? {}).map(([k, v]) => `${k} ${v}`).join(' · '))} | ${m.work ? `${m.work.total} · ${m.work.page} · ${m.work.prePaint}` : ''} | ${m.nLines ?? ''} | ${m.source}${m.users ? ` (user ${String(m.users).slice(0, 6)})` : ''} | ${esc(m.item)}@${actionOf(m)} |`);
  });
  fs.writeFileSync(path.join(OUT, 'tableA.md'), md.join('\n') + '\n');
  console.log(`wrote ${rel(OUT)}/: ${path.basename(outFile)}, counts.md, tableA.md (${slow.length} rows ≥ ${TABLE_MIN} ms)`);
}
/** the harness's own name for one action of an item (what `--only` and profile.mjs take) */
function actionOf(m) {
  return m.kind === 'load' || m.kind === 'edit' || m.kind === 'delete' ? m.kind : `${m.kind}#${m.step}`;
}

async function main() {
  if (args.has('--summarize')) {
    const f = path.resolve(args.arg('--in', outFile));
    if (!fs.existsSync(f)) return console.log(`no data: ${rel(f)} not found — run node scripts/perf/complex/sweep.mjs first`);
    return summarize(JSON.parse(fs.readFileSync(f, 'utf8')), false);
  }
  const listed = await runChild(['--list']);
  const items = listed.list;
  if (!items) return console.log('the harness did not list its corpus — see the error above');
  const want = only?.split(',');
  const missing = (want ?? []).filter((id) => !items.some((i) => i.id === id));
  if (missing.length) console.log(`no data: no item named ${missing.join(', ')} (ids look like fixture:<name>, probe:<name>, prod:<sid>, debug:<session>)`);
  if (want && missing.length === want.length) return;
  if (!only) rotate(OUT, ['measurements.json', 'counts.md', 'tableA.md', 'prof']);
  console.log(`${items.length} corpus items; sweeping ${only ?? 'all of them'} → ${rel(outFile)}`);
  const t0 = Date.now();
  const all = [];
  let from = 0;
  while (from < items.length) {
    const r = await runChild(['--from', String(from), ...(only ? ['--items', only] : [])]);
    all.push(...r.rows);
    if (!r.killed && !r.inflight) break;
    const k = r.lastItem ? r.lastItem.k : from;
    if (r.inflight) {
      all.push({ ...r.inflight, ev: 'm', source: String(r.inflight.item).split(':')[0], ms: `>${LIMIT}`, timeout: true });
      console.log(`TIMEOUT ${r.inflight.item} ${r.inflight.kind}#${r.inflight.step}`);
    }
    from = k + 1;
  }
  // confirm every action ≥ MIN: two solo runs (a fresh process each), median
  if (!args.has('--no-confirm')) {
    for (const m of all) {
      if (typeof m.ms === 'number' && m.ms < MIN) continue;
      const conf = [];
      for (let t = 0; t < 2; t++) {
        const r = await runChild(['--id', m.item, '--only', actionOf(m)]);
        const hit = r.rows.find((x) => x.kind === m.kind);
        conf.push(hit ? hit.ms : `>${LIMIT}`);
      }
      m.confirm = conf;
      m.confirmedMs = conf.every((c) => typeof c === 'number') ? median(conf) : `>${LIMIT}`;
      console.log(`confirmed ${m.item}@${actionOf(m)}: sweep ${m.ms} → solo ${conf.join(', ')}`);
    }
  }
  const doc = { at: new Date().toISOString(), commit: commitStamp(), items: only ? want.length - missing.length : items.length, minutes: Number(((Date.now() - t0) / 60000).toFixed(1)), rows: all.map(({ ev, ...x }) => x) };
  fs.writeFileSync(outFile, JSON.stringify(doc, null, 1));
  console.log(`sweep done in ${doc.minutes} min`);
  summarize(doc, !only);
}
main();
