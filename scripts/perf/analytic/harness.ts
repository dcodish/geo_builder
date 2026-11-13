// ANALYTIC TIMING HARNESS (#2867) — every student action of the analytic builder, replayed through the SAME functions
// App.tsx calls, in the App's order. The actions are src-analytic/__tests__/work-meter/driverAnalytic.ts — the one
// driver this harness and the work-meter gate share; this file is the corpora, the jobs and the CLI.
//
// ENTRY POINT: `node scripts/perf/analytic/driver.mjs` (watchdog + restart; its header has the commands, outputs and
// times). This file is the vite-node child it launches. Direct use, from the repo root
// (V = node node_modules/vite-node/vite-node.mjs):
//   V scripts/perf/analytic/harness.ts -- [--from J] [--to K] [--only "<id>,<id>"] [--out <results.jsonl>]     sweep
//   V scripts/perf/analytic/harness.ts -- --confirm "<key>" | "@<file of keys>" [--reps 2] [--in <results.jsonl>] [--out <confirm.json>] [--prof <file>.cpuprofile]
//   V scripts/perf/analytic/harness.ts -- --count | --list
// Also: --prod <events.jsonl> · --debug <debug-log.jsonl> · --stop-after-step S. Default --out: reports/perf/analytic/results.jsonl.
//
// WHAT IT MEASURES, split by lane:
//   figure   = MAIN thread, blocking, until the figure/verdict is on screen:
//              decideSubmit (or anotherConfiguration / decideEditHost / load audit) + the re-render's derive and the
//              render-time useMemo work (chips, warnings, coincidences, conic chips, unstated notes, scene incl. offersOf,
//              panelKnowledge, segmentKnowledge, paramRows, point rows, curve rows).
//   post     = MAIN thread after paint (passive effects): narrowingNotesOf + circleNotesOf.
//   pool     = BACKGROUND, sliced one seed per macrotask (poolScheduler.ts): UI live, values show «בודק…».
//              Reported as total + the longest single slice (a slice is uninterruptible main-thread work).
//   settle   = MAIN re-render when the pool completes (poolTick memos + the passive effects again), only if pending was shown.
// There is NO Worker in the analytic tree: everything runs on the main thread; "bg" here means time-sliced.
// A record's key is `<source>|<id>|<step>`. CORPORA: known-issue stresses, src-analytic/__tests__/fixtures (figures and
// corpus arrays), folded-sequences.json, prod sessions (logs/perf-prod-events-analytic.jsonl, else the log-triage pull
// logs/prod-events-analytic.jsonl) and the operator's dev sessions (logs/debug-log-analytic.jsonl). A missing input is
// "no data" and its corpus is skipped.
//
// NO LLM (CLAUDE.md rule 2): only decideSubmit and its siblings are called; an `llm-commit` replays the lines the model
// ALREADY returned in the prod log through decideSubmit — no network — and `globalThis.fetch` is stubbed to throw right
// below the imports as a second lock.
//
// COMPARABILITY: every phase value is a wall-clock timing — comparable only on a quiet machine. The clock-free
// numbers recorded are `work` — the work meter's three counts (#2873, ADR-W-210): residual evaluations in all, on the
// page's UI thread, and before the figure can paint, the same numbers the suite's gate holds a fixture to — and
// `poolSlices` (how many background seeds were walked). `verdict` is deterministic too.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from 'node:inspector';
import type { Seed } from '../../../src-analytic/engine/evaluate';
// The App's work per action is the ONE driver this harness and the work-meter gate share (#2873).
import { doAnother, doDelete, doEdit, doLoad, doSubmit, settledState, type Hosts, type Phases, type State } from '../../../src-analytic/__tests__/work-meter/driverAnalytic';
import type { WorkCounts } from '../../../shell/workMeter';
import { SLOW_CORPUS_ANALYTIC } from '../../../src-analytic/__tests__/work-meter/slowCorpusAnalytic';

(globalThis as { fetch: unknown }).fetch = async () => {
  throw new Error('perf harness: network disabled (no LLM)');
};

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = path.join(REPO, 'reports', 'perf', 'analytic');
const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (k: string, d?: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};

/** The rows of one JSONL input: the `flag` override, else the first existing candidate. Missing = "no data", never a crash. */
function corpusRows(flag: string, candidates: string[], what: string): Record<string, unknown>[] {
  const given = arg(flag);
  const file = given ? path.resolve(given) : candidates.map((c) => path.join(REPO, c)).find((f) => fs.existsSync(f));
  if (!file || !fs.existsSync(file)) {
    process.stderr.write(`no data: ${what} — ${given ?? candidates.join(' / ')} not found, corpus skipped\n`);
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { rows.push(JSON.parse(l)); } catch { /* a torn line is not data */ }
  }
  return rows;
}

/** Sample ONLY `fn` into `file` (a V8 .cpuprofile) when a file is given. */
function profiled<T>(file: string | undefined, fn: () => T): T {
  if (!file) return fn();
  const sess = new Session();
  sess.connect();
  sess.post('Profiler.enable');
  sess.post('Profiler.setSamplingInterval', { interval: 500 });
  sess.post('Profiler.start');
  try {
    return fn();
  } finally {
    sess.post('Profiler.stop', (err, res) => {
      if (!err) {
        fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(res.profile));
      }
      sess.disconnect();
    });
  }
}

// ------------------------------------------------------------------ actions
export type ActionKind = 'submit' | 'another' | 'load' | 'delete' | 'edit' | 'llm-commit';
export interface Pre {
  lines: string[];
  seed: Seed;
  hosts: Hosts;
}

// ------------------------------------------------------------------ corpora → jobs
interface SeqJob { kind: 'seq'; source: string; id: string; lines: string[]; saveSeed?: Seed }
interface ProdJob { kind: 'prod'; source: 'prod'; id: string; iph: string; events: Record<string, unknown>[] }
interface DebugJob { kind: 'debug'; source: 'debug'; id: string; events: Record<string, unknown>[] }
type Job = SeqJob | ProdJob | DebugJob;

export function buildJobs(): Job[] {
  const jobs: Job[] = [];
  const seen = new Set<string>();
  const addSeq = (source: string, id: string, lines: string[], saveSeed?: Seed) => {
    const clean = lines.filter((l) => typeof l === 'string' && l.trim());
    if (!clean.length) return;
    const k = JSON.stringify(clean);
    if (seen.has(k)) return;
    seen.add(k);
    jobs.push({ kind: 'seq', source, id, lines: clean, saveSeed });
  };
  // known-issue stresses first — the slow corpus the work meter records too (#2873)
  for (const q of SLOW_CORPUS_ANALYTIC) addSeq('issue', q.id, q.lines);
  const fx = path.join(REPO, 'src-analytic/__tests__/fixtures');
  for (const f of fs.readdirSync(fx).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(fx, f), 'utf8'));
    if (Array.isArray(j)) j.forEach((e: { id?: string; lines: string[] }, i: number) => addSeq('corpus', `${f}#${e.id ?? i}`, e.lines));
    else addSeq('fixture', f, j.lines, j.seed);
  }
  const foldedFile = path.join(REPO, 'src-analytic/__tests__/folded-sequences.json');
  if (fs.existsSync(foldedFile)) {
    const folded = JSON.parse(fs.readFileSync(foldedFile, 'utf8')) as Record<string, string[][]>;
    for (const [file, seqs] of Object.entries(folded)) seqs.forEach((s, i) => addSeq('scenario', `${file}#${i}`, s));
  } else process.stderr.write('no data: src-analytic/__tests__/folded-sequences.json not found, scenario corpus skipped\n');

  // prod sessions
  const prod = corpusRows('--prod', ['logs/perf-prod-events-analytic.jsonl', 'logs/prod-events-analytic.jsonl'], 'prod sessions') as Record<string, never>[];
  const bySid = new Map<string, Record<string, unknown>[]>();
  for (const e of prod) {
    if (e.ev !== 'submit' && e.ev !== 'action') continue;
    if (!bySid.has(e.sid)) bySid.set(e.sid, []);
    bySid.get(e.sid)!.push(e);
  }
  for (const [sid, evs] of bySid) {
    evs.sort((a, b) => String(a.t ?? a.serverTs).localeCompare(String(b.t ?? b.serverTs)));
    jobs.push({ kind: 'prod', source: 'prod', id: sid, iph: String(evs[0].iph), events: evs });
  }
  // operator's dev play logs, deduped by the sequence of what was done
  const dbg = corpusRows('--debug', ['logs/debug-log-analytic.jsonl'], 'dev debug-log sessions') as Record<string, never>[];
  const bySess = new Map<string, Record<string, unknown>[]>();
  for (const e of dbg) {
    if (!bySess.has(e.session)) bySess.set(e.session, []);
    bySess.get(e.session)!.push(e);
  }
  const seenSig = new Set<string>();
  for (const [sid, evs] of bySess) {
    evs.sort((a, b) => Number(a.seq) - Number(b.seq));
    const sig = JSON.stringify(evs.filter((e) => e.kind !== 'figure').map((e) => [e.kind, e.utterance ?? e.action, e.detail ?? e.result]).concat(
      [JSON.stringify(evs.filter((e) => e.kind === 'figure').map((e) => e.lines).at(0) ?? null)] as never));
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    if (!evs.some((e) => e.kind === 'input' || e.kind === 'action')) continue;
    jobs.push({ kind: 'debug', source: 'debug', id: sid, events: evs });
  }
  return jobs;
}

// ------------------------------------------------------------------ running a job
interface Rec {
  job: number;
  source: string;
  id: string;
  iph?: string;
  step: number;
  kind: ActionKind;
  utterance?: string;
  pre: Pre;
  ph: Phases;
  /** The work meter's three counts (#2873): residual evaluations in all, on the page, before the paint. */
  work: WorkCounts;
  key: string;
  index?: number;
}

type Emit = (r: Omit<Rec, 'key'>) => void;
type PhaseCb = (job: number, step: number, kind: string, p: string) => void;

function runJob(ji: number, job: Job, emit: Emit, phase: PhaseCb): void {
  let step = 0;
  const base = { job: ji, source: job.source, id: job.id, ...(job.kind === 'prod' ? { iph: job.iph } : {}) };
  let st = settledState([], 0, {});
  const pre = (s: State): Pre => ({ lines: s.lines, seed: s.seed, hosts: s.hosts });
  const act = (kind: ActionKind, utterance: string | undefined, fn: (cb: (p: string) => void) => { ph: Phases; work: WorkCounts; next: State | null }, extra: { pre?: Pre; index?: number } = {}): State | null => {
    const s = step++;
    const p = extra.pre ?? pre(st);
    const r = fn((ph) => phase(ji, s, kind, ph));
    emit({ ...base, step: s, kind, ...(utterance !== undefined ? { utterance } : {}), ...(extra.index !== undefined ? { index: extra.index } : {}), pre: p, ph: r.ph, work: r.work });
    if (STOP_AFTER !== null && s >= STOP_AFTER) throw new Error('STOP');
    return r.next;
  };

  if (job.kind === 'seq') {
    for (const line of job.lines) st = act('submit', line, (cb) => doSubmit(st, line, cb)) ?? st;
    if (!st.lines.length) return;
    // show another ×6
    let s2 = st;
    for (let i = 0; i < 6; i += 1) {
      const n = act('another', undefined, (cb) => doAnother(s2, cb));
      if (!n) break;
      s2 = n;
    }
    // load the saved file cold (the fixture's own saved seed when it has one, else the configuration on screen)
    act('load', undefined, (cb) => doLoad(st.lines, job.saveSeed ?? st.seed, st.hosts, cb), { pre: { lines: st.lines, seed: job.saveSeed ?? st.seed, hosts: st.hosts } });
    // edit the last line to its own text (decideEditHost)
    act('edit', st.lines[st.lines.length - 1], (cb) => doEdit(st, st.lines.length - 1, st.lines[st.lines.length - 1], cb), { index: st.lines.length - 1 });
    // delete the first fact of a multi-fact figure
    if (st.lines.length > 1) act('delete', st.lines[0], (cb) => doDelete(st, 0, cb));
    return;
  }

  if (job.kind === 'prod') {
    const history: State[] = [];
    let degraded = false;
    for (const e of job.events) {
      if (degraded) break; // the figure is no longer the student's: stop rather than time a different figure
      if (e.ev === 'action') {
        const a = String(e.action ?? '');
        if (a === 'clear') { history.push(st); st = settledState([], 0, {}); continue; }
        if (a === 'undo' && history.length) { st = history.pop()!; continue; }
        if (a === 'show-another') { const n = act('another', undefined, (cb) => doAnother(st, cb)); if (n) { history.push(st); st = n; } continue; }
        if (a === 'delete' && typeof e.detail === 'string' && st.lines.includes(e.detail)) {
          const at = st.lines.indexOf(e.detail);
          const n = act('delete', e.detail, (cb) => doDelete(st, at, cb));
          history.push(st); st = n!; continue;
        }
        if (a === 'edit' && typeof e.detail === 'string') {
          const m = /^(\d+):([\s\S]*)$/.exec(e.detail);
          if (m && Number(m[1]) < st.lines.length) {
            const n = act('edit', m[2], (cb) => doEdit(st, Number(m[1]), m[2], cb), { index: Number(m[1]) });
            if (n) { history.push(st); st = n; }
            continue;
          }
        }
        if (a === 'display' || a === 'llm-retry') continue;
        degraded = true; // load / toggle / an undo past the tracked history
        continue;
      }
      const u = String(e.utterance ?? '').replace(/\s+/g, ' ').trim();
      if (!u) continue;
      if (e.source === 'llm') {
        // the model's accepted lines, each through decideSubmit (runFallback does this after the network)
        if (e.result !== 'lines' || typeof e.commands !== 'string') { if (e.result === 'lines') degraded = true; continue; }
        let ls: string[];
        try { ls = JSON.parse(e.commands); } catch { degraded = true; continue; }
        for (const l of ls) {
          const n = act('llm-commit', l, (cb) => doSubmit(st, l, cb));
          if (n) { history.push(st); st = n; }
        }
        continue;
      }
      const n = act('submit', u, (cb) => doSubmit(st, u, cb));
      if (n) { history.push(st); st = n; }
    }
    return;
  }

  // debug: the log's own figure snapshots are authoritative for state; inputs/actions are timed from the state on screen
  const evs = job.events;
  let pendingAction: { kind: ActionKind; detail: string } | null = null;
  for (const e of evs) {
    if (e.kind === 'figure') {
      const lines = (e.lines as string[]) ?? [];
      const disabled = (e.disabled as number[]) ?? [];
      const act2 = lines.filter((_, i) => !disabled.includes(i));
      const seed = (e.seed as Seed) ?? 0;
      if (pendingAction && pendingAction.kind === 'delete') {
        const pa = pendingAction;
        const at = st.lines.indexOf(pa.detail);
        if (at >= 0 && JSON.stringify(st.lines.filter((_, i) => i !== at)) === JSON.stringify(act2)) act('delete', pa.detail, (cb) => doDelete(st, at, cb));
      }
      pendingAction = null;
      if (JSON.stringify(act2) !== JSON.stringify(st.lines) || JSON.stringify(seed) !== JSON.stringify(st.seed)) st = settledState(act2, seed, {});
      continue;
    }
    if (e.kind === 'action') {
      const a = String(e.action ?? '');
      if (a === 'show-another') act('another', undefined, (cb) => doAnother(st, cb));
      else if (a === 'delete') pendingAction = { kind: 'delete', detail: String(e.detail ?? '') };
      continue;
    }
    if (e.kind === 'input') {
      if (e.source !== 'parser') continue;
      const u = String(e.utterance ?? '').trim();
      if (!u) continue;
      act('submit', u, (cb) => doSubmit(st, u, cb));
    }
  }
}

// ------------------------------------------------------------------ main
// --stop-after-step S: end each job after its step S (to profile a slow step in its real session context: --from J --to J+1)
const STOP_AFTER: number | null = arg('--stop-after-step') !== undefined ? Number(arg('--stop-after-step')) : null;
const keyOf = (r: Omit<Rec, 'key'>) => `${r.source}|${r.id}|${r.step}`;

function sweep(): void {
  const from = Number(arg('--from', '0'));
  const to = Number(arg('--to', '1e9'));
  const out = path.resolve(arg('--out') ?? path.join(OUT_DIR, 'results.jsonl'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const jobs = buildJobs();
  // --only "<id>,<id>": a job's id (a fixture file name, a prod sid, …) or "<source>|<id>"
  const only = arg('--only')?.split(',');
  const wanted = (j: Job) => !only || only.includes(j.id) || only.includes(`${j.source}|${j.id}`);
  const missing = (only ?? []).filter((o) => !jobs.some((j) => j.id === o || `${j.source}|${j.id}` === o));
  if (missing.length) process.stderr.write(`no data: no job named ${missing.join(', ')} (--list prints the ids)\n`);
  for (let ji = from; ji < Math.min(to, jobs.length); ji += 1) {
    const job = jobs[ji];
    if (!wanted(job)) continue;
    process.stdout.write(`JOB ${ji} ${job.source} ${job.id}\n`);
    try {
      runJob(
        ji,
        job,
        (r) => fs.appendFileSync(out, JSON.stringify({ ...r, key: keyOf(r) }) + '\n'),
        (j, s, k, p) => process.stdout.write(`BEGIN ${j} ${s} ${k} ${p}\n`),
      );
    } catch (err) {
      fs.appendFileSync(out, JSON.stringify({ job: ji, source: job.source, id: job.id, error: String((err as Error)?.stack ?? err).slice(0, 400) }) + '\n');
    }
    process.stdout.write(`DONE ${ji}\n`);
  }
  process.stdout.write('ALLDONE\n');
}

/** Re-run one recorded action on its own (fresh process state, settled pre-state), `reps` times. */
function confirm(): void {
  const spec = arg('--confirm')!;
  // `@file` = one key per line (to-confirm.txt, written by summarize.mjs)
  const keys = spec.startsWith('@') ? fs.readFileSync(spec.slice(1), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : spec.split(',');
  const reps = Number(arg('--reps', '2'));
  const src = path.resolve(arg('--in') ?? path.join(OUT_DIR, 'results.jsonl'));
  if (!fs.existsSync(src)) {
    process.stdout.write(`no data: ${src} not found — run the sweep first (node scripts/perf/analytic/driver.mjs)\n`);
    return;
  }
  const recs = new Map<string, Rec>();
  for (const l of fs.readFileSync(src, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const r = JSON.parse(l) as Rec;
    if (r.key) recs.set(r.key, r);
  }
  const out: Record<string, (Phases & { work: WorkCounts })[]> = {};
  for (const k of keys) {
    const r = recs.get(k);
    if (!r) { process.stdout.write(`MISSING ${k}\n`); continue; }
    out[k] = [];
    for (let i = 0; i < reps; i += 1) {
      const st = settledState(r.pre.lines, r.pre.seed, r.pre.hosts);
      const cb = () => {};
      // --prof <file>: the LAST repetition of the action (and only the action) is CPU-profiled
      const done = profiled(i === reps - 1 ? arg('--prof') : undefined, () => {
        if (r.kind === 'submit' || r.kind === 'llm-commit') return doSubmit(st, r.utterance!, cb);
        if (r.kind === 'another') return doAnother(st, cb);
        if (r.kind === 'load') return doLoad(r.pre.lines, r.pre.seed, r.pre.hosts, cb); // pre = the saved state
        if (r.kind === 'delete') return doDelete(st, r.pre.lines.indexOf(r.utterance!), cb);
        return doEdit(st, r.index ?? 0, r.utterance!, cb);
      });
      const ph = { ...done.ph, work: done.work };
      out[k].push(ph);
      if (arg('--out')) fs.writeFileSync(arg('--out')!, JSON.stringify(out));
      process.stdout.write(`CONFIRM ${k} ${JSON.stringify(ph)}\n`);
    }
  }
  const o = arg('--out');
  if (o) fs.writeFileSync(o, JSON.stringify(out));
}

if (arg('--confirm')) confirm();
else if (argv.includes('--count')) process.stdout.write(`COUNT ${buildJobs().length}\n`);
else if (argv.includes('--list')) for (const j of buildJobs()) process.stdout.write(`${j.source}|${j.id}\n`);
else sweep();
