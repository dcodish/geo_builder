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
// WHAT IT MEASURES. Each slice is attributed to main / worker / bg by the op that runs it in the browser
// (src/store/geoWork.ts lanes; geoWorker.ts budgets):
//   submit  = decidePreParse/decideFromParse (main, minus the prefold hook = worker 'prefold')
//             → commitVerdict (main) → render replay (main) → meetsRequirements (main, runViewResolve's gate)
//             → [worker autoResolve = meetsRequirements + findValidConfig(…, 12 s) + replay(found)] → render (main)
//   another = searchAnotherView(facts, seed, _, WORKER_SEARCH_BUDGET_MS) (worker) → render (main)
//   load    = clearReplayCaches → loadFigureText (refresh audit + smoke replay main; prefold worker) → render → resolve
//   delete  = removeGroup (seed 0) → render replay (main, cold content) → meetsRequirements (main) → autoResolve (worker)
//   detect  = detectAll (bg lane, caches cleared first = the detect worker's own cold memo)
// CORPORA: the issue sequences below, src/__tests__/fixtures, the scenario corpus (scenarios-export.ts), prod sessions
// (logs/perf-prod-events.jsonl, else the log-triage pull logs/prod-events-2d.jsonl) and the operator's dev sessions
// (logs/debug-log.jsonl). A missing input is reported as "no data" and its corpus skipped.
//
// NO LLM (CLAUDE.md rule 2): `globalThis.fetch` is stubbed to throw right below the node imports, before any
// harness code runs, and only the deterministic lane is ever called. An `escalate` verdict stops there; its logged/fixture
// commands are FOLLOWED and timed separately as the post-LLM tail (dryRunOutcome + commit + resolve).
//
// COMPARABILITY: every number here is a wall-clock timing — comparable only on a quiet machine, same machine, before
// vs after. This harness records no clock-free counter; `outcome` / `clipped` (a budget was hit) are deterministic.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';

(globalThis as any).fetch = async () => {
  throw new Error('perf harness: network disabled (no LLM)');
};

import { decidePreParse, decideFromParse } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import {
  useGeoStore,
  replay,
  meetsRequirements,
  findValidConfig,
  searchAnotherView,
  getFoldFor,
  detectAll,
  clearReplayCaches,
  dryRunOutcome,
  groupKey,
  WORKER_SEARCH_BUDGET_MS,
  type Fact,
} from '@/store/geoStore';
import { rowNouns } from '@/store/rowNouns';
import { loadFigureText } from '@/store/figureLoad';
import { serializeFigure } from '@/store/figureFile';

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

type Snap = { facts: Fact[]; seed: number };
type Step =
  | { k: 'submit'; u: string; locale: 'he' | 'en'; before?: Snap; follow?: any[] | null; occ?: number }
  | { k: 'another'; before?: Snap; occ?: number }
  | { k: 'delete'; before?: Snap; key?: string }
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
    return [{ k: 'load', before: s }, { k: 'presses', n: 6 }, { k: 'delete' }, { k: 'detect' }];
  };

  // 0. known issues / PR figure (thread mode)
  const issue = (id: string, ref: string, us: string[]): Item => ({
    id: `issue:${id}`,
    source: 'issue',
    ref,
    steps: [...us.map((u) => ({ k: 'submit' as const, u, locale: 'he' as const })), { k: 'presses', n: 6 }, { k: 'load' }, { k: 'delete' }, { k: 'detect' }],
  });
  items.push(
    issue('2860-tangent-right-triangle', 'PR #2860 / #2831 / #2867', ['נתון מעגל O שרדיוסו 5', 'מנקודה A הוציאו משיק למעגל בנקודה B', 'OA = 13', 'משולש ישר זווית ABD', 'BD = 6']),
    issue('2481-inscribed-square', '#2481', ['מרובע ABCD', 'AB = 3', 'BC = 4', 'ריבוע ABCD חסום במעגל']),
    issue('2481-control', '#2481 control / #2359 square analog', ['מרובע ABCD', 'AB = 3', 'BC = 4', 'ABCD ריבוע']),
    issue('2359-pentagon', '#2359', ['מחומש ABCDE', 'AB = 3', 'BC = 4', 'המחומש משוכלל']),
    issue('2359-pentagon-ok', '#2359 control', ['מחומש ABCDE', 'המחומש משוכלל']),
    issue('2295-iso-8', '#2295', ['משולש שווה שוקיים ABC', 'AB = 4', 'BC = 8']),
    issue('2295-iso-9', '#2295', ['משולש שווה שוקיים ABC', 'AB = 4', 'BC = 9']),
    issue('2513', '#2513', ['מעגל O', 'ריבוע ABCD חסום במעגל O', 'ריבוע חוסם את מעגל O']),
    issue('2104-named', '#2104', ['משולש ABC', 'מעגל O', 'AB משיק למעגל בנקודה D', 'BC משיק למעגל בנקודה E', 'CA משיק למעגל בנקודה F']),
    issue('2104-unnamed', '#2104', ['משולש ABC', 'מעגל O', 'AB משיק למעגל', 'BC משיק למעגל', 'CA משיק למעגל']),
    issue('2104-list', '#2104', ['משולש ABC', 'מעגל O', 'הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה']),
    issue('2104-square', '#2104', ['ריבוע ABCD', 'מעגל O', 'AB משיק למעגל בנקודה D', 'BC משיק למעגל בנקודה E', 'CA משיק למעגל בנקודה F']),
    issue('1768-kite-area', '#1768', ['ABCD דלתון חסום במעגל', 'AB=AD', 'CB=CD', 'E על DC', 'BE⊥DC', 'AC', 'N = חיתוך BE ו-AC', 'שטח משולש NCE = שטח משולש ACD']),
    issue('2572-chord', '#2572', ['מעגל O ברדיוס 2', 'AB מיתר במעגל', 'AB = 6']),
    issue('2572-inscribed', '#2572', ['מעגל O ברדיוס 3', 'משולש ABC חסום במעגל O', 'AB = 8']),
    issue('2601-incircle-reach', '#2601 / #2572 / #2538', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'AB = 4']),
    issue('2601-566-arc', '#2601 (the #566 arc figure)', ['משולש ישר זווית ABC', 'משולש ABC חסום במעגל', 'קשת AB = קשת BC']),
  );

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
    steps.push({ k: 'load', text }, { k: 'presses', n: 6 }, { k: 'delete' }, { k: 'detect' });
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
let figure: Snap = { facts: [], seed: 0 };
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

function setStore(s: Snap) {
  useGeoStore.setState({ facts: s.facts, seed: s.seed });
}
function warm(s: Snap) {
  // what the App has already paid before the student acts: the render replay and the resolve gate (main)
  try {
    replay(s.facts, s.seed);
    meetsRequirements(s.facts, s.seed);
  } catch {}
}
const viewOf = (s: Snap) => {
  const d = replay(s.facts, s.seed);
  return { construction: d.construction, positions: d.positions };
};
const badStatus = (s: Snap) => {
  try {
    const d = replay(s.facts, s.seed);
    return Object.values(d.status).some((v) => v !== 'ok' && v !== 'disabled');
  } catch {
    return true;
  }
};

/** render + resolve after a commit/load/delete: returns slices; mutates `figure`. */
function settle(rec: any, prefix: string) {
  let t = now();
  replay(figure.facts, figure.seed);
  rec[prefix + 'render_main'] = r1(now() - t);
  t = now();
  const ok = meetsRequirements(figure.facts, figure.seed);
  rec[prefix + 'check_main'] = r1(now() - t);
  if (!ok) {
    t = now();
    meetsRequirements(figure.facts, figure.seed); // the worker re-checks first (geoWorker.ts)
    const found = findValidConfig(figure.facts, figure.seed, WORKER_SEARCH_BUDGET_MS);
    if (found) replay(found.facts, found.seed);
    const w = now() - t;
    rec[prefix + 'autoResolve_worker'] = r1(w);
    rec[prefix + 'autoResolve'] = found ? 'found' : 'exhausted';
    if (w >= WORKER_SEARCH_BUDGET_MS - 50) rec.clipped = true;
    if (found) {
      figure = { facts: found.facts, seed: found.seed };
      t = now();
      replay(figure.facts, figure.seed);
      rec[prefix + 'render2_main'] = r1(now() - t);
    }
  }
}

function sumSlices(rec: any) {
  let main = 0,
    worker = 0;
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v !== 'number') continue;
    if (k.endsWith('_main')) main += v;
    else if (k.endsWith('_worker')) worker += v;
  }
  rec.main_ms = r1(main);
  rec.worker_ms = r1(worker);
  rec.total_ms = r1(main + worker);
}

async function doSubmit(st: Extract<Step, { k: 'submit' }>, rec: any) {
  if (st.before) figure = st.before;
  warm(figure);
  setStore(figure);
  rec.u = st.u;
  rec.nfacts = figure.facts.length;
  const view = viewOf(figure);
  let prefold = 0;
  const t0 = now();
  const pre = decidePreParse(st.u, view, false);
  let verdict: any = pre;
  if (pre?.kind === 'store-op') {
    const s = useGeoStore.getState();
    const res = pre.op === 'swap' ? s.swap(pre.from, pre.to) : pre.op === 'name-centre' ? s.nameCentre(pre.from, pre.to) : pre.op === 'rename' ? s.rename(pre.from, pre.to) : s.merge(pre.from, pre.to);
    rec.decide_main = r1(now() - t0);
    rec.outcome = 'store-op:' + (res.ok ? 'ok' : 'fail');
    if (res.ok) {
      const n = useGeoStore.getState();
      figure = { facts: n.facts, seed: n.seed };
      settle(rec, '');
    }
    sumSlices(rec);
    return;
  }
  if (!pre) {
    verdict = await decideFromParse({ facts: figure.facts, seed: figure.seed, view, centresShown: false }, st.u, st.locale, {
      prefold: async (trial, seed) => {
        const a = now();
        replay(trial, seed);
        getFoldFor(trial);
        prefold += now() - a;
      },
    });
  }
  const dt = now() - t0;
  rec.decide_main = r1(dt - prefold);
  if (prefold) rec.prefold_worker = r1(prefold);
  rec.outcome = verdict.kind + (verdict.kind === 'refuse' ? ':' + verdict.category : '') + (verdict.kind === 'escalate' ? ':' + (verdict.weak ?? 'nh') : '');
  if (verdict.kind === 'refuse' || verdict.kind === 'escalate') {
    const lg = (verdict.logs ?? []).find((l: any) => !l.intermediate) ?? (verdict.logs ?? [])[verdict.logs?.length - 1];
    rec.detail = String(lg?.result ?? verdict.parseReason ?? '').slice(0, 120);
  }
  if (verdict.kind === 'commit' || verdict.kind === 'noop') {
    let t = now();
    commitVerdict(verdict, st.u);
    rec.commit_main = r1(now() - t);
    const n = useGeoStore.getState();
    figure = { facts: n.facts, seed: n.seed };
    settle(rec, '');
    sumSlices(rec);
    return;
  }
  sumSlices(rec);
  // not committed by our lane: follow the logged/fixture commands (the post-LLM tail), timed separately
  if (st.follow && st.follow.length) {
    try {
      const t = now();
      const out = dryRunOutcome(figure.facts, st.follow as any, figure.seed);
      rec.post_dryrun_main = r1(now() - t);
      const t2 = now();
      useGeoStore.getState().executeMany(st.follow as any, st.u);
      rec.post_commit_main = r1(now() - t2);
      const n = useGeoStore.getState();
      figure = { facts: n.facts, seed: n.seed };
      const sub: any = {};
      settle(sub, 'post_');
      Object.assign(rec, sub);
      rec.followed = out?.produced ? 'ok' : 'not-produced';
      let pm = 0,
        pw = 0;
      for (const [k, v] of Object.entries(rec)) {
        if (!k.startsWith('post_') || typeof v !== 'number') continue;
        if (k.endsWith('_main')) pm += v;
        else if (k.endsWith('_worker')) pw += v;
      }
      rec.post_main_ms = r1(pm);
      rec.post_worker_ms = r1(pw);
    } catch (e: any) {
      rec.followed = 'error:' + String(e?.message ?? e).slice(0, 80);
    }
  }
}

function doAnother(rec: any) {
  warm(figure);
  rec.nfacts = figure.facts.length;
  const t = now();
  const found = searchAnotherView(figure.facts, figure.seed, undefined, WORKER_SEARCH_BUDGET_MS);
  const w = now() - t;
  rec.resample_worker = r1(w);
  if (w >= WORKER_SEARCH_BUDGET_MS - 50) rec.clipped = true;
  rec.outcome = found ? 'changed' : 'only-config';
  if (found) {
    figure = { facts: found.facts, seed: found.seed };
    const t2 = now();
    replay(figure.facts, figure.seed);
    rec.render_main = r1(now() - t2);
  }
  sumSlices(rec);
}

async function runItem(idx: number, item: Item) {
  clearReplayCaches();
  useGeoStore.setState({ facts: [], seed: 0 });
  useGeoStore.temporal.getState().clear();
  figure = { facts: [], seed: 0 };
  history = [];
  future = [];
  let pressNo = 0;
  for (let si = 0; si < item.steps.length; si++) {
    const st = item.steps[si];
    const base: any = { item: item.id, source: item.source, si, k: st.k };
    if (item.users) base.user = item.users;
    if ((st as any).occ && (st as any).occ > 1) base.occ = (st as any).occ;
    try {
      if (st.k === 'clear') {
        history.push(figure);
        future = [];
        figure = { facts: [], seed: 0 };
        continue;
      }
      if (st.k === 'undo') {
        if (history.length) {
          future.push(figure);
          figure = history.pop()!;
        }
        continue;
      }
      if (st.k === 'redo') {
        if (future.length) {
          history.push(figure);
          figure = future.pop()!;
        }
        continue;
      }
      if (st.k === 'submit') {
        const prev = figure;
        begin(idx, si, 'submit');
        const rec: any = { ...base, k: 'submit' };
        rec.trail = trail.slice(-12);
        await doSubmit(st, rec);
        emit(rec);
        trail.push(st.u);
        if (figure !== prev) {
          history.push(prev);
          future = [];
        }
        continue;
      }
      if (st.k === 'another') {
        if (st.before) figure = st.before;
        if (!figure.facts.length) continue;
        begin(idx, si, 'another');
        const rec: any = { ...base, press: ++pressNo, trail: trail.slice(-12) };
        doAnother(rec);
        emit(rec);
        continue;
      }
      if (st.k === 'presses') {
        if (!figure.facts.length) continue;
        for (let p = 1; p <= st.n; p++) {
          begin(idx, si, 'another#' + p);
          const rec: any = { ...base, k: 'another', press: p, trail: trail.slice(-12) };
          doAnother(rec);
          emit(rec);
          if (rec.outcome === 'only-config') break;
        }
        continue;
      }
      if (st.k === 'load') {
        const s = st.before ?? figure;
        if (!s.facts.length && !st.text) continue;
        const text = st.text ?? serializeFigure({ facts: s.facts, seed: s.seed });
        const fk = JSON.stringify(JSON.parse(text).facts.map((f: any) => f.cmd)) + '|' + JSON.parse(text).seed;
        if (loadedFinals.has(fk)) continue;
        loadedFinals.add(fk);
        begin(idx, si, 'load');
        clearReplayCaches();
        const rec: any = { ...base, nfacts: s.facts.length, trail: trail.slice(-12) };
        let pf = 0;
        const t = now();
        const out = await loadFigureText(text, {
          prefold: async (facts, seed) => {
            const a = now();
            replay(facts, seed);
            const f = getFoldFor(facts);
            pf += now() - a;
            return f;
          },
        });
        rec.load_main = r1(now() - t - pf);
        rec.prefold_worker = r1(pf);
        rec.outcome = out.ok ? 'ok' : 'refused:' + (out as any).reason;
        if (out.ok) {
          const n = useGeoStore.getState();
          figure = { facts: n.facts, seed: n.seed };
          settle(rec, '');
        }
        sumSlices(rec);
        emit(rec);
        continue;
      }
      if (st.k === 'delete') {
        const s = st.before ?? figure;
        const keys = [...new Set(s.facts.map(groupKey))];
        if (keys.length < 2) continue;
        const key = st.key ?? keys[0];
        begin(idx, si, 'delete');
        warm(s);
        const rec: any = { ...base, nfacts: s.facts.length, trail: trail.slice(-12) };
        figure = { facts: s.facts.filter((f) => groupKey(f) !== key), seed: 0 };
        settle(rec, '');
        sumSlices(rec);
        emit(rec);
        if (st.key) figure = s; // anchored: the log re-anchors anyway
        continue;
      }
      if (st.k === 'detect') {
        const s = st.before ?? figure;
        if (!s.facts.length) continue;
        begin(idx, si, 'detect');
        clearReplayCaches();
        const rec: any = { ...base, nfacts: s.facts.length };
        const t = now();
        detectAll(s.facts, rowNouns(s.facts));
        rec.detect_bg = r1(now() - t);
        rec.total_ms = rec.detect_bg;
        rec.main_ms = 0;
        rec.worker_ms = 0;
        emit(rec);
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
      const steps = it.steps.map((s, si) => (sis.has(si) || (si < max && !(s as any).before && s.k !== 'load' && s.k !== 'detect' && !(s.k === 'delete' && !(s as any).key)) ? s : ({ k: 'skip' } as any)));
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
