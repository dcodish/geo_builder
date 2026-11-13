// 3-D TIMING HARNESS (#2867) — every student action the 3-D App runs, replayed through the real 3-D code.
//
// ENTRY POINT: `node scripts/perf/3d/drive3.mjs` (watchdog + restart; its header has the commands, outputs and times).
// This file is the vite-node child it launches. Direct use, from the repo root (V = node node_modules/vite-node/vite-node.mjs):
//   V scripts/perf/3d/sweep3.ts -- --out <results.jsonl> [--from N] [--only "<taskId>,<taskId>"] [--hb <heartbeat.json>]
//   V scripts/perf/3d/sweep3.ts -- --out x.jsonl --only "<taskId>" --action <ai> [--prof <file>.cpuprofile]
//   V scripts/perf/3d/sweep3.ts -- --count        (how many tasks; also what profile3.mjs uses to dump modules)
// Also: --prod <events.jsonl> · --debug <debug-log.jsonl>. Default --out: reports/perf/3d/results.jsonl.
//
// WHAT IT MEASURES — all on the MAIN THREAD (3-D has no worker):
//   submit  = decideDeterministic3 (App3.submitSentence3) + dispatchVerdict + the App's render-side derivations
//   another = store.resample() + render;  load = store.loadFigure + auditLoad3 + render (cold fact-array identity)
//   delete  = store.remove(first fact) + render;  llm-step = decideSteps3 + dispatch + render (prod LLM-committed lines)
// "render" = what App3 recomputes on a new (facts, seed): derive3 (memo), freeDofCount3, plane/dihedral/param chips
// (collectWedges), dataView (panel open by default on wide screens), buildScene3 at the home camera.
// Task ids: fx:<fixture file> · prod:<sid> · dbg:<session> · issue:<name>. CORPORA: fixtures3/, prod sessions
// (logs/perf-prod-events-3d.jsonl, else the log-triage pull logs/prod-events-3d.jsonl), the operator's dev sessions
// (logs/debug-log-3d.jsonl) and the issue sequences below. A missing input is "no data" and its corpus is skipped.
//
// NO LLM (CLAUDE.md rule 2): only the deterministic lane is called (decideDeterministic3; an `llm-step` replays the
// lines the model ALREADY returned in the prod log through decideSteps3 — no network), and `globalThis.fetch` is
// stubbed to throw right below the imports as a second lock.
//
// COMPARABILITY: ms / decideMs / renderMs are wall-clock timings — comparable only on a quiet machine. The counters
// recorded beside them are CLOCK-FREE and comparable anywhere, on any machine, under any load:
//   uncached (derive3 memo misses) · resolves (resolve passes) · lmSolves / lmEvals (least-squares solves / residual evaluations).
import { readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useGeo3, derive3, decideSteps3, decideCommands3, deriveStats3, type Fact3 } from '../../../src3d/store/store3';
import { decideDeterministic3 } from '../../../src3d/app/decideDeterministic3';
import { deserializeFigure3 } from '../../../src3d/store/figureFile3';
import { auditLoad3 } from '../../../src3d/store/loadAudit3';
import { freeDofCount3, resolveStats3 } from '../../../src3d/engine/evaluate';
import { leastSquaresStats } from '../../../src3d/engine/solve3';
import { dataView } from '../../../src3d/engine/dataView';
import { planeChipsByFact } from '../../../src3d/store/planeChips';
import { dihedralChipsByFact } from '../../../src3d/store/dihedralChips';
import { paramChipsByFact } from '../../../src3d/store/paramChips';
import { collectWedges, competingArcSymbols } from '../../../src3d/render/wedges';
import { buildScene3 } from '../../../src3d/render/scene3';
import { HOME_CAMERA } from '../../../src3d/render/camera';

(globalThis as any).fetch = async () => {
  throw new Error('perf harness: network disabled (no LLM)');
};

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k: string): string | undefined => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const OUT = resolve(arg('--out') ?? join(REPO, 'reports', 'perf', '3d', 'results.jsonl'));
const HB = arg('--hb');
const FROM = Number(arg('--from') ?? 0);
/** --only "<taskId>,<taskId>" — task ids never contain a comma */
const ONLY = arg('--only')?.split(',');

/** The lines of one JSONL input: the `flag` override, else the first existing candidate. Missing = "no data", never a crash. */
function corpusLines(flag: string, candidates: string[], what: string): any[] {
  const given = arg(flag);
  const file = given ? resolve(given) : candidates.map((c) => join(REPO, c)).find((f) => existsSync(f));
  if (!file || !existsSync(file)) {
    console.error(`no data: ${what} — ${given ?? candidates.join(' / ')} not found, corpus skipped`);
    return [];
  }
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const ONLY_ACTION = arg('--action') !== undefined ? Number(arg('--action')) : undefined;
const PRESSES = 6;
const PROF = arg('--prof'); // with --only/--action: write a .cpuprofile of the target action only

type St = { facts: Fact3[]; seed: any };
type Action = {
  kind: 'submit' | 'another' | 'load' | 'delete' | 'llm-step';
  prior: string[]; // enabled utterances on the figure before the action
  utterance?: string;
  run: () => { verdict: string; decideMs?: number; renderMs?: number };
};
type Task = { id: string; corpus: 'fixture' | 'prod' | 'debug' | 'issue'; user?: string; build: (emit: (a: Omit<Action, 'run'> & { fn: () => any }) => Promise<void>) => Promise<void> };

const now = () => performance.now();
const clean = (fs: any[]): Fact3[] => fs.map((f) => ({ id: f.id, enabled: f.enabled !== false, utterance: f.utterance, cmds: f.cmds }));
const priorOf = (): string[] => useGeo3.getState().facts.filter((f) => f.enabled).map((f) => f.utterance);

/** The App's render-side derivations for the store's current (facts, seed). */
function render(): number {
  const t = now();
  const { facts, seed } = useGeo3.getState();
  try {
    const d = derive3(facts, seed);
    freeDofCount3(d.construction, d.resolved);
    planeChipsByFact(facts, (id) => d.status[id] === 'ok', (n) => d.resolved.planes.has(n));
    dihedralChipsByFact(facts, (id) => d.status[id] === 'ok');
    paramChipsByFact(facts, competingArcSymbols(collectWedges(d.construction, d.resolved.positions)));
    dataView(d.construction, seed);
    buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1, {}, true, () => 'value', []);
  } catch {
    /* a render throw is not a timing concern here */
  }
  return now() - t;
}
const setState = (st: St) => useGeo3.setState({ facts: st.facts, seed: st.seed, lastError: null, lastNotice: null });

/** Submit one typed line exactly as App3.submitSentence3 does (deterministic lane only — never the LLM). */
function submitLine(raw: string): { verdict: string; decideMs: number; renderMs: number } {
  const t = now();
  const v = decideDeterministic3(useGeo3.getState(), raw);
  let verdict: string = v.kind;
  if (v.kind === 'guided') useGeo3.setState({ lastError: null });
  else {
    useGeo3.getState().dispatchVerdict(v);
    if (v.kind === 'refused') verdict = `refused:${(v.error as any)?.code}`;
  }
  const decideMs = now() - t;
  return { verdict, decideMs, renderMs: v.kind === 'record' || v.kind === 'retick' || v.kind === 'rename' || v.kind === 'swap' ? render() : 0 };
}

// ---------------------------------------------------------------- corpora
function fixtureTasks(): Task[] {
  const dir = join(REPO, 'fixtures3');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.geo3.json'))
    .sort()
    .map((name) => ({
      id: `fx:${name}`,
      corpus: 'fixture' as const,
      build: async (emit) => {
        const text = readFileSync(join(dir, name), 'utf8');
        const r = deserializeFigure3(text);
        if (!r.ok) return;
        // LOAD first (cold: fresh identities, nothing of this figure derived yet)
        setState({ facts: [], seed: 0 });
        await emit({ kind: 'load', prior: r.facts.filter((f) => f.enabled).map((f) => f.utterance), fn: () => {
          const rr = deserializeFigure3(text) as any;
          const t = now();
          useGeo3.getState().loadFigure(rr.facts, rr.seed, rr.queries, rr.planeDisplay, rr.displayMode, rr.dihedralShown);
          const a = auditLoad3(rr.facts, rr.seed);
          const decideMs = now() - t;
          return { verdict: a.failed.length ? `load-failed:${a.failed.length}/${a.total}` : 'ok', decideMs, renderMs: render() };
        } });
        // step through the utterances one submit at a time
        setState({ facts: [], seed: 0 });
        render();
        for (const f of r.facts) {
          await emit({ kind: 'submit', prior: priorOf(), utterance: f.utterance, fn: () => {
            const res = submitLine(f.utterance);
            if (res.verdict !== 'record' && res.verdict !== 'retick') {
              // fixture drift: commit the saved commands untimed so the rest of the file still steps
              const st = useGeo3.getState();
              const v = decideCommands3(st, f.utterance, f.cmds, { twins: false, seedSearch: true });
              if (v.kind === 'record') useGeo3.getState().dispatchVerdict(v);
              res.verdict += '(+saved-cmds)';
            }
            return res;
          } });
        }
        // show another, PRESSES times on the stepped figure
        for (let i = 0; i < PRESSES; i++)
          await emit({ kind: 'another', prior: priorOf(), fn: () => {
            const t = now();
            useGeo3.getState().resample();
            const decideMs = now() - t;
            return { verdict: `seed:${JSON.stringify(useGeo3.getState().seed)}`, decideMs, renderMs: render() };
          } });
        // delete the first fact
        if (useGeo3.getState().facts.length > 1)
          await emit({ kind: 'delete', prior: priorOf(), utterance: useGeo3.getState().facts[0].utterance, fn: () => {
            const t = now();
            useGeo3.getState().remove(useGeo3.getState().facts[0].id);
            const decideMs = now() - t;
            return { verdict: `err:${(useGeo3.getState().lastError as any)?.code ?? 'none'}`, decideMs, renderMs: render() };
          } });
      },
    }));
}

function llmLines(e: any): string[] | null {
  if (e.source !== 'llm' || e.result !== 'ok' || !e.commands) return null;
  try {
    const v = typeof e.commands === 'string' ? JSON.parse(e.commands) : e.commands;
    return Array.isArray(v) && v.length && v.every((x: unknown) => typeof x === 'string') ? v : null;
  } catch {
    return null;
  }
}

/** Prod sessions, in order — the control flow of src3d/app/triageReplay3.ts, timed, plus timed show-another presses. */
function prodTasks(): Task[] {
  const L = corpusLines('--prod', ['logs/perf-prod-events-3d.jsonl', 'logs/prod-events-3d.jsonl'], 'prod sessions');
  const bySid = new Map<string, any[]>();
  for (const e of L) if (e.sid && (e.ev === 'submit' || e.ev === 'action')) (bySid.get(e.sid) ?? bySid.set(e.sid, []).get(e.sid)!).push(e);
  return [...bySid].map(([sid, evs]) => ({
    id: `prod:${sid}`,
    corpus: 'prod' as const,
    user: evs[0]?.iph,
    build: async (emit) => {
      setState({ facts: [], seed: 0 });
      render();
      const history: St[] = [];
      let future: St[] = [];
      const cur = (): St => ({ facts: useGeo3.getState().facts, seed: useGeo3.getState().seed });
      for (const e of evs) {
        if (e.ev === 'action') {
          const a = e.action ?? '';
          if (a === 'clear') { history.push(cur()); future = []; setState({ facts: [], seed: 0 }); }
          else if (a === 'undo' && history.length) { future.push(cur()); setState(history.pop()!); }
          else if (a === 'redo' && future.length) { history.push(cur()); setState(future.pop()!); }
          else if (a === 'show-another' && useGeo3.getState().facts.length)
            await emit({ kind: 'another', prior: priorOf(), fn: () => {
              history.push(cur());
              const t = now();
              useGeo3.getState().resample();
              const decideMs = now() - t;
              return { verdict: `seed:${JSON.stringify(useGeo3.getState().seed)}`, decideMs, renderMs: render() };
            } });
          continue;
        }
        const u = (e.utterance ?? '').replace(/\s+/g, ' ').trim();
        if (!u) continue;
        const before = cur();
        await emit({ kind: 'submit', prior: priorOf(), utterance: u, fn: () => {
          const res = submitLine(u);
          const after = cur();
          if (after.facts !== before.facts) { history.push(before); future = []; }
          return res;
        } });
        const lines = llmLines(e);
        if (lines && useGeo3.getState().facts === before.facts)
          await emit({ kind: 'llm-step', prior: priorOf(), utterance: `${u}  ⟶ [${lines.join(' | ')}]`, fn: () => {
            const t = now();
            const v = decideSteps3(useGeo3.getState(), u, lines);
            useGeo3.getState().dispatchVerdict(v);
            const decideMs = now() - t;
            if (v.kind === 'record') { history.push(before); future = []; }
            return { verdict: v.kind, decideMs, renderMs: v.kind === 'record' ? render() : 0 };
          } });
      }
      // the session's final figure: delete-first (load is not replayable from prod: the file is not logged)
      if (useGeo3.getState().facts.length > 1)
        await emit({ kind: 'delete', prior: priorOf(), utterance: useGeo3.getState().facts[0].utterance, fn: () => {
          const t = now();
          useGeo3.getState().remove(useGeo3.getState().facts[0].id);
          const decideMs = now() - t;
          return { verdict: `err:${(useGeo3.getState().lastError as any)?.code ?? 'none'}`, decideMs, renderMs: render() };
        } });
    },
  }));
}

/** The operator's dev sessions: every one-fact-appended transition between `figure` snapshots is a submit (deduped
 *  across sessions by (prior list, seed, line)); each session's largest figure is loaded, pressed and edited. */
function debugTasks(): Task[] {
  const L = corpusLines('--debug', ['logs/debug-log-3d.jsonl'], 'dev debug-log sessions');
  const bySes = new Map<string, any[]>();
  for (const e of L) if (e.kind === 'figure') (bySes.get(e.session) ?? bySes.set(e.session, []).get(e.session)!).push(e);
  const seenStep = new Set<string>();
  const seenFig = new Set<string>();
  const keyOf = (fs: any[]) => JSON.stringify(fs.map((f) => [f.enabled, f.utterance]));
  const tasks: Task[] = [];
  for (const [ses, figs] of bySes) {
    const steps: { prev: Fact3[]; seed: any; fact: Fact3 }[] = [];
    let prev: any[] = [];
    let prevSeed: any = 0;
    let biggest: any = null;
    for (const fg of figs) {
      const F = fg.facts ?? [];
      if (F.length === prev.length + 1 && prev.every((p, i) => p.id === F[i].id)) {
        const k = keyOf(prev) + '|' + JSON.stringify(prevSeed) + '|' + F[F.length - 1].utterance;
        if (!seenStep.has(k)) { seenStep.add(k); steps.push({ prev: clean(prev), seed: prevSeed, fact: clean([F[F.length - 1]])[0] }); }
      }
      if (F.length && (!biggest || F.length >= biggest.facts.length)) biggest = fg;
      prev = F;
      prevSeed = fg.seed ?? 0;
    }
    let fig: { facts: Fact3[]; seed: any } | null = null;
    if (biggest && biggest.facts.length > 1) {
      const k = keyOf(biggest.facts) + JSON.stringify(biggest.seed);
      if (!seenFig.has(k)) { seenFig.add(k); fig = { facts: clean(biggest.facts), seed: biggest.seed ?? 0 }; }
    }
    if (!steps.length && !fig) continue;
    tasks.push({
      id: `dbg:${ses}`,
      corpus: 'debug',
      build: async (emit) => {
        for (const s of steps) {
          setState({ facts: s.prev, seed: s.seed });
          render(); // the App had already drawn the prior figure
          await emit({ kind: 'submit', prior: s.prev.filter((f) => f.enabled).map((f) => f.utterance), utterance: s.fact.utterance, fn: () => submitLine(s.fact.utterance) });
        }
        if (!fig) return;
        const f0 = fig;
        setState({ facts: [], seed: 0 });
        await emit({ kind: 'load', prior: f0.facts.filter((f) => f.enabled).map((f) => f.utterance), fn: () => {
          const facts = JSON.parse(JSON.stringify(f0.facts));
          const t = now();
          useGeo3.getState().loadFigure(facts, f0.seed);
          const a = auditLoad3(facts, f0.seed);
          const decideMs = now() - t;
          return { verdict: a.failed.length ? `load-failed:${a.failed.length}/${a.total}` : 'ok', decideMs, renderMs: render() };
        } });
        for (let i = 0; i < PRESSES; i++)
          await emit({ kind: 'another', prior: priorOf(), fn: () => {
            const t = now();
            useGeo3.getState().resample();
            const decideMs = now() - t;
            return { verdict: `seed:${JSON.stringify(useGeo3.getState().seed)}`, decideMs, renderMs: render() };
          } });
        if (useGeo3.getState().facts.length > 1)
          await emit({ kind: 'delete', prior: priorOf(), utterance: useGeo3.getState().facts[0].utterance, fn: () => {
            const t = now();
            useGeo3.getState().remove(useGeo3.getState().facts[0].id);
            const decideMs = now() - t;
            return { verdict: `err:${(useGeo3.getState().lastError as any)?.code ?? 'none'}`, decideMs, renderMs: render() };
          } });
      },
    });
  }
  return tasks;
}

/** The open / recently closed slow issues' own sequences (each stepped, then pressed PRESSES times, then loaded cold). */
const ISSUE_ROWS: [string, string[]][] = [
  ['#2787 square', ['ריבוע ABCD', 'קטע AS', '|SA| = 5']],
  ['#2787 rectangle', ['מלבן ABCD', 'קטע AS', '|SA| = 5']],
  ['#2787 control apex', ['מלבן ABCD', 'פירמידה ABCDS שבסיסה ריבוע', '|SA| = 5']],
  ['#2749 narrowed', ['מלבן ABCD', 'ריבוע ABCD', 'קטע AS', '|SA| = 5']],
  ['#2749 narrowed AC', ['מלבן ABCD', 'ריבוע ABCD', '|AC| = 5']],
  ['#2806 x-axis', ['ריבוע ABCD', 'הקודקוד A נמצא על ציר ה-x']],
  ['#2806 z-axis', ['ריבוע ABCD', 'הקודקוד A נמצא על ציר ה-z']],
  ['#2806 origin', ['ריבוע ABCD', 'A בראשית הצירים']],
  ['#2806 rhombus', ['מעוין ABCD', 'הקודקוד A נמצא על ציר ה-x']],
  ['#2806 kite', ['דלתון ABCD', 'הקודקוד A נמצא על ציר ה-x']],
  ['#863 on-line', ["מנסרה ישרה משולשת ABCA'B'C'", "ישר AA'=(k-1,k-7,k+1)", 'AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)']],
  ['#863 equation', ["מנסרה ישרה משולשת ABCA'B'C'", "ישר AA'=(k-1,k-7,k+1)", 'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)']],
  ['#863 pair', ["מנסרה ישרה משולשת ABCA'B'C'", "AA'=(k-1,k-7,k+1)", 'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)']],
  ['#863 fixture', ["מנסרה ישרה משולשת ABCA'B'C'", "AA'=(k-1,k-7,k+1)", 'AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)']],
];
function issueTasks(): Task[] {
  return ISSUE_ROWS.map(([name, lines]) => ({
    id: `issue:${name}`,
    corpus: 'issue' as const,
    build: async (emit) => {
      setState({ facts: [], seed: 0 });
      render();
      for (const u of lines) await emit({ kind: 'submit', prior: priorOf(), utterance: u, fn: () => submitLine(u) });
      for (let i = 0; i < PRESSES; i++)
        await emit({ kind: 'another', prior: priorOf(), fn: () => {
          const t = now();
          useGeo3.getState().resample();
          const decideMs = now() - t;
          return { verdict: `seed:${JSON.stringify(useGeo3.getState().seed)}`, decideMs, renderMs: render() };
        } });
      const saved = JSON.stringify(useGeo3.getState().facts);
      await emit({ kind: 'load', prior: priorOf(), fn: () => {
        const facts = JSON.parse(saved);
        const t = now();
        useGeo3.getState().loadFigure(facts, 0);
        const a = auditLoad3(facts, 0);
        const decideMs = now() - t;
        return { verdict: a.failed.length ? `load-failed:${a.failed.length}/${a.total}` : 'ok', decideMs, renderMs: render() };
      } });
    },
  }));
}

// ---------------------------------------------------------------- run
export function allTasks(): Task[] {
  return [...fixtureTasks(), ...prodTasks(), ...debugTasks(), ...issueTasks()];
}

async function main() {
  const tasks = allTasks();
  if (argv.includes('--count')) {
    console.log(JSON.stringify({ tasks: tasks.length }));
    return;
  }
  if (argv.includes('--list')) {
    for (const t of tasks) console.log(t.id);
    return;
  }
  const missing = (ONLY ?? []).filter((id) => !tasks.some((t) => t.id === id));
  if (missing.length) console.error(`no data: no task named ${missing.join(', ')} (ids look like fx:<file>.geo3.json, issue:<name>, prod:<sid>, dbg:<session>; --list prints them)`);
  mkdirSync(dirname(OUT), { recursive: true });
  for (let ti = FROM; ti < tasks.length; ti++) {
    const task = tasks[ti];
    if (ONLY && !ONLY.includes(task.id)) continue;
    let ai = 0;
    await task.build(async (a) => {
      const idx = ai++;
      // confirm mode: actions before the target run untimed (state build-up), the target is timed, later ones skipped
      if (ONLY_ACTION !== undefined && idx > ONLY_ACTION) return;
      if (HB) writeFileSync(HB, JSON.stringify({ ti, ai: idx, id: task.id, kind: a.kind, utterance: a.utterance, prior: a.prior, corpus: task.corpus, user: task.user, t: Date.now() }));
      const profiling = PROF && idx === ONLY_ACTION;
      let sess: any = null;
      if (profiling) {
        const insp = await import('node:inspector/promises');
        sess = new insp.Session();
        sess.connect();
        await sess.post('Profiler.enable');
        await sess.post('Profiler.setSamplingInterval', { interval: 200 });
        await sess.post('Profiler.start');
      }
      const u0 = deriveStats3.uncached, r0 = resolveStats3.uncached, s0 = leastSquaresStats.solves, e0 = leastSquaresStats.evals;
      const t0 = now();
      let r: any;
      try { r = a.fn(); } catch (e) { r = { verdict: `throw:${String((e as Error)?.message ?? e).slice(0, 80)}` }; }
      const ms = now() - t0;
      if (profiling) {
        const { profile } = await sess.post('Profiler.stop');
        writeFileSync(PROF!, JSON.stringify(profile));
        sess.disconnect();
      }
      if (ONLY_ACTION !== undefined && idx !== ONLY_ACTION) return;
      appendFileSync(OUT, JSON.stringify({ ti, ai: idx, task: task.id, corpus: task.corpus, user: task.user, kind: a.kind, prior: a.prior, utterance: a.utterance,
        ms: Math.round(ms), decideMs: Math.round(r.decideMs ?? ms), renderMs: Math.round(r.renderMs ?? 0), uncached: deriveStats3.uncached - u0, resolves: resolveStats3.uncached - r0, lmSolves: leastSquaresStats.solves - s0, lmEvals: leastSquaresStats.evals - e0, verdict: r.verdict, thread: 'main' }) + '\n');
    });
    if (HB) writeFileSync(HB, JSON.stringify({ ti, done: true, t: Date.now() }));
  }
  if (HB) writeFileSync(HB, JSON.stringify({ finished: true, t: Date.now() }));
}
main().then(() => process.exit(0));
