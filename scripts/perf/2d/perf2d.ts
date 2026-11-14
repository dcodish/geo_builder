// 2-D TIMING HARNESS (#2867) — what the 2-D App AWAITS per student action, replayed through the real 2-D code.
//
// ENTRY POINT: `node scripts/perf/2d/driver.mjs` (watchdog + restart; its header has the commands, outputs and times).
// This file is the vite-node child it launches. Direct use, from the repo root (V = node node_modules/vite-node/vite-node.mjs):
//   V --mode production scripts/perf/2d/perf2d.ts -- --build [--sources fixture,issue,prod,debug,scenario]   → <out>/jobs.json
//   V --mode production scripts/perf/2d/perf2d.ts -- --run [--from I] [--to J] [--only id1,id2]
//   V --mode production scripts/perf/2d/perf2d.ts -- --confirm "item:si,item:si" [--runs 2] [--profile-confirm]
//   V --mode production scripts/perf/2d/perf2d.ts -- --confirm "item:si" --runs 1 --profile "item:si:k"
// Common: --out <dir> (default reports/perf/2d) · --jobs <file> · --scenarios <file> · --prof-dir <dir> ·
//         --prod <events.jsonl> · --debug <debug-log.jsonl>. Streams "@@ITEM" / "@@BEGIN" / "@@REC <json>" on stdout.
//
// WHAT IT MEASURES. The actions are src/__tests__/work-meter/driver2d.ts — the ONE driver this harness and the
// work-meter gate share (#2873); its header lists each action's steps. Each slice is attributed to main / worker / bg
// by the op that runs it in the browser (src/store/geoWork.ts lanes); this file hands the driver geoWorker.ts's own
// bodies with its 12 s budget (`workerOps` below), charged to the worker lane:
//   submit  = decidePreParse/decideFromParse (main, minus the prefold hook = worker 'prefold')
//             → commitVerdict (main) → render (main) → meetsRequirements (main, runViewResolve's gate)
//             → [worker autoResolve = meetsRequirements + findValidConfig(…, 12 s) + replay(found)] → render (main)
//   another = searchAnotherView(facts, seed, _, WORKER_SEARCH_BUDGET_MS) (worker) → render (main)
//   load    = clearReplayCaches → loadFigureText (refresh + smoke replay main; prefold worker) → render → resolve
//             → auditLoadedFigure (main, App.tsx runLoad)
//   edit    = runEditCommit(last row, its own text) (main) → render → resolve
//   delete  = removeGroup (seed 0) → render (main, cold content) → meetsRequirements (main) → autoResolve (worker)
//   detect  = detectAll (bg lane, caches cleared first = the detect worker's own cold memo), over a structured clone
//             (what the worker receives; the driver makes it, ADR-827) of the figure as it
//             stood BEFORE the delete
// CORPORA: the slow corpus (src/__tests__/work-meter/slowCorpus2d.ts: the open speed issues), src/__tests__/fixtures, the scenario corpus (scenarios-export.ts), prod sessions
// (logs/perf-prod-events.jsonl, else the log-triage pull logs/prod-events-2d.jsonl) and the operator's dev sessions
// (logs/debug-log.jsonl). A missing input is reported as "no data" and its corpus skipped.
//
// NO LLM (CLAUDE.md rule 2): `globalThis.fetch` is stubbed to throw right below the node imports, before any
// harness code runs, and only the deterministic lane is ever called. An `escalate` verdict stops there; its logged/fixture
// commands are FOLLOWED and timed separately as the post-LLM tail (dryRunOutcome + commit + resolve).
//
// COMPARABILITY: every `*_ms` here is a wall-clock timing — comparable only on a quiet machine, same machine, before
// vs after. `work` { total, page, prePaint } is the work meter's three counts (#2873, ADR-W-210): evaluateCore calls in
// all, on the page's UI thread, and before the figure can paint. It is clock-free and comparable anywhere, EXCEPT on
// an action marked `clipped`: this harness runs the browser's clock budgets (--mode production), and where a 12 s
// search is cut depends on the machine. The suite's gate runs the same driver with NO clock, so its counts are the
// whole search's and are exact; the two are different measurements of one action. `outcome` is deterministic too.
import { useGeoWorkExecutor } from '../../../src/store/geoWork';
import { geoOps } from '../../../src/store/geoOps';
import { sameInstanceExecutor } from '../../../shell/workerExecutor';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';

(globalThis as any).fetch = async () => {
  throw new Error('perf harness: network disabled (no LLM)');
};

import { replay, meetsRequirements, findValidConfig, searchAnotherView, getFoldFor, detectAll, groupKey, WORKER_SEARCH_BUDGET_MS, type Fact } from '@/store/geoStore';
import { rowNouns } from '@/store/rowNouns';
import { serializeFigure } from '@/store/figureFile';
import { createDriver2d, type Snap, type WorkerOps } from '@/__tests__/work-meter/driver2d';
import { SLOW_CORPUS_2D } from '@/__tests__/work-meter/slowCorpus2d';
import { inWorkerLane } from '../../../shell/workMeter';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const now = () => performance.now();
const r1 = (x: number) => Math.round(x * 10) / 10;
const args = process.argv.slice(2);
const arg = (k: string, d?: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
/** Everything this harness writes goes here (gitignored: jobs.json holds prod utterances). */
const OUT = path.resolve(arg('--out') ?? path.join(REPO, 'reports', 'perf', '2d'));

/** The rows of one JSONL input: the `flag` override, else the first existing candidate. Missing = "no data", never a crash. */
function corpusRows(flag: string, candidates: string[], what: string): any[] {
  const given = arg(flag);
  const file = given ? path.resolve(given) : candidates.map((c) => path.join(REPO, c)).find((f) => existsSync(f));
  if (!file || !existsSync(file)) {
    console.log(`no data: ${what} — ${given ?? candidates.join(' / ')} not found, corpus skipped`);
    return [];
  }
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
}

type Step =
  | { k: 'submit'; u: string; locale: 'he' | 'en'; before?: Snap; follow?: any[] | null; occ?: number }
  | { k: 'another'; before?: Snap; occ?: number }
  | { k: 'delete'; before?: Snap; key?: string }
  | { k: 'edit' } // #2888: the last row edited in a session that built the rows before it and not that row (Driver2d.editLastRow); an item's last step
  | { k: 'retype' } // unmeasured: the last row re-typed where the old edit was measured, so delete and detect run in the same session as before
  | { k: 'clear' }
  | { k: 'undo' }
  | { k: 'redo' }
  | { k: 'load'; text?: string; before?: Snap }
  | { k: 'detect'; before?: Snap }
  | { k: 'presses'; n: number };
type Item = { id: string; source: string; ref: string; steps: Step[]; users?: string };

const strip = (fs: any[]): Fact[] =>
  fs.map((f) => {
    const { status: _s, ...rest } = f;
    return rest as Fact;
  });

// ───────────────────────────── job building ─────────────────────────────
function buildJobs(): Item[] {
  const items: Item[] = [];
  const finals = new Set<string>();
  const finalKey = (s: Snap) => JSON.stringify([s.seed, s.facts.filter((f) => f.enabled !== false).map((f) => f.cmd)]);
  const tail = (s?: Snap): Step[] => {
    // load / another×6 / delete-first / detect on a final figure — once per distinct content
    if (!s || !s.facts.length) return [];
    const key = finalKey(s);
    if (finals.has(key)) return [];
    finals.add(key);
    return [{ k: 'load', before: s }, { k: 'presses', n: 6 }, { k: 'retype' }, { k: 'delete' }, { k: 'detect' }, { k: 'edit' }];
  };

  // 0. known issues / PR figure (thread mode) — the slow corpus the work meter records too (#2873)
  const issue = (id: string, ref: string, us: string[]): Item => ({
    id: `issue:${id}`,
    source: 'issue',
    ref,
    steps: [...us.map((u) => ({ k: 'submit' as const, u, locale: 'he' as const })), { k: 'presses', n: 6 }, { k: 'load' }, { k: 'retype' }, { k: 'delete' }, { k: 'detect' }, { k: 'edit' }],
  });
  items.push(...SLOW_CORPUS_2D.map((q) => issue(q.id, q.ref, q.lines)));

  // 1. fixtures (thread mode; the fixture's own group commands are followed when our lane does not commit)
  const fxDir = path.join(REPO, 'src/__tests__/fixtures');
  for (const name of readdirSync(fxDir).filter((n) => n.endsWith('.json')).sort()) {
    const text = readFileSync(path.join(fxDir, name), 'utf8');
    let file: any;
    try {
      file = JSON.parse(text);
    } catch {
      continue;
    }
    const facts: Fact[] = file.facts ?? [];
    const groups: { key: string; facts: Fact[] }[] = [];
    for (const f of facts) {
      const key = groupKey(f);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.facts.push(f);
      else groups.push({ key, facts: [f] });
    }
    const locale = file.locale === 'en' ? 'en' : 'he';
    const steps: Step[] = groups.map((g) => ({ k: 'submit', u: g.facts[0].utterance ?? '', locale, follow: g.facts.map((f) => f.cmd) }));
    const snap = { facts, seed: file.seed ?? 0 };
    finals.add(finalKey(snap));
    steps.push({ k: 'load', text }, { k: 'presses', n: 6 }, { k: 'retype' }, { k: 'delete' }, { k: 'detect' }, { k: 'edit' });
    items.push({ id: `fixture:${name}`, source: 'fixture', ref: name, steps });
  }

  // 2. prod sessions (thread mode, triage's model: logged LLM commands followed; clear/undo/redo followed)
  const prod = corpusRows('--prod', ['logs/perf-prod-events.jsonl', 'logs/prod-events-2d.jsonl'], 'prod sessions');
  const bySid = new Map<string, any[]>();
  for (const e of prod) {
    if (e.ev !== 'submit' && e.ev !== 'action') continue;
    const sid = e.sid ?? '(nosid)';
    if (!bySid.has(sid)) bySid.set(sid, []);
    bySid.get(sid)!.push(e);
  }
  for (const [sid, evs] of bySid) {
    evs.sort((a, b) => String(a.t ?? a.serverTs).localeCompare(String(b.t ?? b.serverTs)));
    const steps: Step[] = [];
    for (const e of evs) {
      if (e.ev === 'action') {
        if (e.action === 'clear') steps.push({ k: 'clear' });
        else if (e.action === 'undo') steps.push({ k: 'undo' });
        else if (e.action === 'redo') steps.push({ k: 'redo' });
        else if (e.action === 'show-another') steps.push({ k: 'another' });
        // delete/edit/toggle: not reproducible from the log (no id) — skipped; the figure may diverge
        continue;
      }
      const u = String(e.utterance ?? '').trim();
      if (!u) continue;
      let follow: any[] | null = null;
      if (e.source === 'llm' && e.result === 'ok' && e.commands) {
        try {
          const c = typeof e.commands === 'string' ? JSON.parse(e.commands) : e.commands;
          if (Array.isArray(c) && c.length) follow = c;
        } catch {}
      }
      steps.push({ k: 'submit', u, locale: e.locale === 'en' ? 'en' : 'he', follow });
    }
    if (!steps.some((s) => s.k === 'submit' || s.k === 'another')) continue;
    steps.push({ k: 'load' }, { k: 'delete' }, { k: 'detect' }); // final-figure tail (deduped at run time by content)
    items.push({ id: `prod:${sid}`, source: 'prod', ref: sid, users: evs[0].iph, steps });
  }

  // 3. operator debug-log sessions (ANCHOR mode: every action measured on the exact figure he had, from the
  //    preceding `figure` event); identical (figure, utterance) pairs measured once, occurrences counted.
  const dbg = corpusRows('--debug', ['logs/debug-log.jsonl'], 'dev debug-log sessions');
  const bySess = new Map<string, any[]>();
  for (const e of dbg) {
    if (!bySess.has(e.session)) bySess.set(e.session, []);
    bySess.get(e.session)!.push(e);
  }
  const seenSubmit = new Map<string, { k: 'submit'; occ: number }>();
  const seenAnother = new Map<string, { occ: number }>();
  for (const [sess, evs] of bySess) {
    evs.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    // ANCHOR = the figure on screen when the student acted. The App logs the post-commit `figure` event BEFORE the
    // `input` row (and the post-applyView figure before the `show-another` row), so figures logged after the previous
    // non-figure event and within 50 ms of this one are THIS action's result: step back past them.
    let settled: Snap = { facts: [], seed: 0 }; // the figure as of the last non-figure event
    let recent: { snap: Snap; ts: number }[] = []; // figures logged since then
    const steps: Step[] = [];
    const tsOf = (e: any) => Date.parse(e.clientTs ?? e.serverTs ?? '') || 0;
    for (const e of evs) {
      if (e.kind === 'figure') {
        recent.push({ snap: { facts: strip(e.facts ?? []), seed: e.seed ?? 0 }, ts: tsOf(e) });
        continue;
      }
      const t = tsOf(e);
      const own = e.kind === 'input' || (e.kind === 'action' && e.action === 'show-another');
      let cut = recent.length;
      if (own) while (cut > 0 && t - recent[cut - 1].ts < 50) cut--;
      const cur: Snap = cut > 0 ? recent[cut - 1].snap : settled;
      settled = recent.length ? recent[recent.length - 1].snap : settled;
      recent = [];
      const ck = JSON.stringify([cur.seed, cur.facts.map((f) => [f.cmd, f.enabled, f.group ?? null])]);
      if (e.kind === 'input') {
        const u = String(e.utterance ?? '').trim();
        if (!u) continue;
        const key = ck + '|' + u + '|' + e.locale;
        const prior = seenSubmit.get(key);
        if (prior) {
          prior.occ++;
          continue;
        }
        const st: any = { k: 'submit', u, locale: e.locale === 'en' ? 'en' : 'he', before: cur, follow: e.source === 'llm' && Array.isArray(e.commands) && e.commands.length ? e.commands : null, occ: 1 };
        seenSubmit.set(key, st);
        steps.push(st);
      } else if (e.kind === 'action' && e.action === 'show-another') {
        const prior = seenAnother.get(ck);
        if (prior) {
          prior.occ++;
          continue;
        }
        const st: any = { k: 'another', before: cur, occ: 1 };
        seenAnother.set(ck, st);
        steps.push(st);
      } else if (e.kind === 'action' && e.action === 'delete' && e.detail) {
        steps.push({ k: 'delete', before: cur, key: String(e.detail) });
      }
    }
    // the last non-empty figure of the session → load tail
    let last: Snap | undefined;
    for (const e of evs) if (e.kind === 'figure' && (e.facts ?? []).length) last = { facts: strip(e.facts), seed: e.seed ?? 0 };
    steps.push(...tail(last).filter((s) => s.k !== 'presses' && s.k !== 'detect')); // debug: no bg detect (time; the other corpora cover it)
    if (steps.length) items.push({ id: `debug:${sess}`, source: 'debug', ref: sess, steps });
  }
  // 4. the hand-authored scenario corpus (exported by scenarios-export.ts → scenarios.json), appended LAST
  const scen = path.resolve(arg('--scenarios') ?? path.join(OUT, 'scenarios.json'));
  if (arg('--scenarios') === 'none') {
    /* the caller asked for no scenario corpus */
  } else if (existsSync(scen)) items.push(...JSON.parse(readFileSync(scen, 'utf8')));
  else console.log(`no data: scenario corpus — ${scen} not found (scenarios-export.ts writes it), corpus skipped`);
  // --sources a,b keeps only those corpora (issue | fixture | prod | debug | scenario)
  const sources = arg('--sources')?.split(',');
  return sources ? items.filter((it) => sources.includes(it.source)) : items;
}

// ───────────────────────────── measurement ─────────────────────────────
// The actions themselves are src/__tests__/work-meter/driver2d.ts — the ONE driver this harness and the work-meter gate
// share. This file gives it the worker's operations as a browser runs them and keeps the session bookkeeping.

/** geoWorker.ts's own bodies, with its 12 s budget, charged to the worker lane: what a browser's worker runs. */
// #2890 (ADR-830): every decision goes through the App's client; here it is served by the worker's own table, with its
// 12 s budget, in this instance, charged to the worker lane (shell/workerExecutor's same-instance executor).
useGeoWorkExecutor(sameInstanceExecutor(geoOps({ searchBudgetMs: WORKER_SEARCH_BUDGET_MS, crossing: false })));
const driver = createDriver2d({}, { searchBudgetMs: WORKER_SEARCH_BUDGET_MS });
let history: Snap[] = [];
let future: Snap[] = [];
const loadedFinals = new Set<string>();
const emit = (o: any) => {
  stopProfile();
  process.stdout.write('@@REC ' + JSON.stringify(confirmRun ? { ...o, run: confirmRun } : o) + '\n');
};
// --profile "item:si:k" (k as in @@BEGIN, e.g. submit / another#1 / load) writes <prof-dir>/<item>-<si>-<k>.cpuprofile of that action only
const PROF = arg('--profile') ?? null;
const PROF_DIR = path.resolve(arg('--prof-dir') ?? path.join(OUT, 'prof'));
let profSession: Session | null = null;
let profName = '';
const begin = (item: number, si: number, k: string) => {
  process.stdout.write(`@@BEGIN ${item} ${si} ${k}\n`);
  // --profile-confirm: in confirm run 2, every targeted action is profiled (prof-dir/<item>-<si>-<k>.cpuprofile)
  const auto = args.includes('--profile-confirm') && confirmRun === Number(arg('--profile-run', '2')) && confirmTargets.has(`${item}:${si}`);
  if ((PROF && PROF === `${item}:${si}:${k}`) || auto) {
    profSession = new Session();
    profSession.connect();
    profSession.post('Profiler.enable');
    profSession.post('Profiler.setSamplingInterval', { interval: 500 });
    profSession.post('Profiler.start');
    profName = `${item}-${si}-${k.replace('#', '_')}`;
  }
};
function stopProfile() {
  if (!profSession) return;
  const s = profSession;
  profSession = null;
  s.post('Profiler.stop', (err: any, res: any) => {
    if (err) return;
    mkdirSync(PROF_DIR, { recursive: true });
    writeFileSync(path.join(PROF_DIR, profName + '.cpuprofile'), JSON.stringify(res.profile));
    s.disconnect();
  });
}

async function runItem(idx: number, item: Item) {
  driver.reset();
  history = [];
  future = [];
  let pressNo = 0;
  /** The figure the item last built or loaded, before a delete took a row off it: what the background sweep covers. */
  let whole: Snap = driver.figure();
  /** The figure as loaded: the n rows the `edit` step edits the last of (#2888). */
  let loadedSnap: Snap | null = null;
  for (let si = 0; si < item.steps.length; si++) {
    const st = item.steps[si];
    const base: any = { item: item.id, source: item.source, si, k: st.k };
    if (item.users) base.user = item.users;
    if ((st as any).occ && (st as any).occ > 1) base.occ = (st as any).occ;
    try {
      if (st.k === 'clear') {
        history.push(driver.figure());
        future = [];
        await driver.show({ facts: [], seed: 0 });
        continue;
      }
      if (st.k === 'undo') {
        if (history.length) {
          future.push(driver.figure());
          await driver.show(history.pop()!);
        }
        continue;
      }
      if (st.k === 'redo') {
        if (future.length) {
          history.push(driver.figure());
          await driver.show(future.pop()!);
        }
        continue;
      }
      if (st.k === 'submit') {
        const prev = driver.figure();
        begin(idx, si, 'submit');
        await driver.show(st.before ?? prev);
        const rec: any = { ...base, k: 'submit', trail: trail.slice(-12), ...(await driver.submit(st.u, st.locale, st.follow)) };
        emit(rec);
        trail.push(st.u);
        if (driver.figure() !== prev) {
          history.push(prev);
          future = [];
        }
        whole = driver.figure();
        continue;
      }
      if (st.k === 'another') {
        if (st.before) driver.show(st.before);
        if (!driver.figure().facts.length) continue;
        begin(idx, si, 'another');
        await driver.show(driver.figure());
        emit({ ...base, press: ++pressNo, trail: trail.slice(-12), ...(await driver.another()) });
        whole = driver.figure();
        continue;
      }
      if (st.k === 'presses') {
        if (!driver.figure().facts.length) continue;
        for (let p = 1; p <= st.n; p++) {
          begin(idx, si, 'another#' + p);
          await driver.show(driver.figure());
          const rec: any = { ...base, k: 'another', press: p, trail: trail.slice(-12), ...(await driver.another()) };
          emit(rec);
          if (rec.outcome === 'only-config') break;
        }
        whole = driver.figure();
        continue;
      }
      if (st.k === 'load') {
        const s = st.before ?? driver.figure();
        if (!s.facts.length && !st.text) continue;
        const text = st.text ?? serializeFigure({ facts: s.facts, seed: s.seed });
        const fk = JSON.stringify(JSON.parse(text).facts.map((f: any) => f.cmd)) + '|' + JSON.parse(text).seed;
        if (loadedFinals.has(fk)) continue;
        loadedFinals.add(fk);
        begin(idx, si, 'load');
        emit({ ...base, nfacts: s.facts.length, trail: trail.slice(-12), ...(await driver.load(text)) });
        whole = driver.figure();
        loadedSnap = whole;
        continue;
      }
      if (st.k === 'retype') {
        if (!driver.figure().facts.some((f) => f.utterance)) continue;
        await driver.show(driver.figure());
        await driver.edit(); // unmeasured (#2888)
        whole = driver.figure();
        continue;
      }
      if (st.k === 'edit') {
        const all = loadedSnap ?? whole;
        if (!all.facts.length) continue;
        begin(idx, si, 'edit');
        const rec = await driver.editLastRow(all);
        if (rec) emit({ ...base, trail: trail.slice(-12), ...rec });
        continue;
      }
      if (st.k === 'delete') {
        const s = st.before ?? driver.figure();
        if (new Set(s.facts.map(groupKey)).size < 2) continue;
        begin(idx, si, 'delete');
        await driver.show(s);
        const rec = await driver.remove(st.key);
        if (rec) emit({ ...base, trail: trail.slice(-12), ...rec });
        if (st.key) driver.show(s); // anchored: the log re-anchors anyway
        continue;
      }
      if (st.k === 'detect') {
        const s = st.before ?? whole;
        if (!s.facts.length) continue;
        begin(idx, si, 'detect');
        emit({ ...base, ...(await driver.detect(s.facts)) });
        continue;
      }
    } catch (e: any) {
      emit({ ...base, error: String(e?.stack ?? e).slice(0, 300) });
    }
  }
}
let trail: string[] = [];
let confirmRun = 0;
const confirmTargets = new Set<string>();

async function main() {
  const jobsPath = path.resolve(arg('--jobs') ?? path.join(OUT, 'jobs.json'));
  if (args.includes('--build')) {
    const items = buildJobs();
    mkdirSync(path.dirname(jobsPath), { recursive: true });
    writeFileSync(jobsPath, JSON.stringify(items));
    const c: Record<string, number> = {};
    for (const it of items) for (const s of it.steps) c[it.source + ':' + s.k] = (c[it.source + ':' + s.k] ?? 0) + 1;
    console.log('items', items.length, c);
    return;
  }
  if (!existsSync(jobsPath)) {
    console.log(`no data: ${jobsPath} not found — build it first (--build, or run scripts/perf/2d/driver.mjs)`);
    process.exit(1);
  }
  const items: Item[] = JSON.parse(readFileSync(jobsPath, 'utf8'));
  const confirm = arg('--confirm'); // "itemIdx:si,itemIdx:si" — re-measure those actions (prefix rebuilt), twice each
  if (confirm) {
    const want = new Map<number, Set<number>>();
    for (const p of confirm.split(',')) {
      const [i, si] = p.split(':').map(Number);
      if (!want.has(i)) want.set(i, new Set());
      want.get(i)!.add(si);
      confirmTargets.add(`${i}:${si}`);
    }
    const runs = Number(arg('--runs', '2'));
    for (const [i, sis] of want) {
      const max = Math.max(...sis);
      const it = items[i];
      const steps = it.steps.map((s, si) => (sis.has(si) || (si < max && !(s as any).before && s.k !== 'load' && s.k !== 'detect' && s.k !== 'edit' && s.k !== 'retype' && !(s.k === 'delete' && !(s as any).key)) ? s : ({ k: 'skip' } as any)));
      for (let r = 1; r <= runs; r++) {
        trail = [];
        confirmRun = r;
        loadedFinals.clear(); // each confirm run re-measures its load
        process.stdout.write(`@@ITEM ${i} ${it.id}\n`);
        await runItem(i, { ...it, steps });
      }
    }
    process.stdout.write('@@DONE\n');
    process.exit(0);
  }
  const only = arg('--only')?.split(',');
  const from = Number(arg('--from', '0'));
  const to = Number(arg('--to', String(items.length)));
  for (let i = from; i < Math.min(to, items.length); i++) {
    if (only && !only.includes(items[i].id)) continue;
    trail = [];
    process.stdout.write(`@@ITEM ${i} ${items[i].id}\n`);
    await runItem(i, items[i]);
  }
  process.stdout.write('@@DONE\n');
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
