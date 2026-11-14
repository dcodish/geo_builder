// COMPLEX-NUMBERS TIMING HARNESS (#2867) — every student action of the complex builder, replayed through its real code.
//
// ENTRY POINT: `node scripts/perf/complex/sweep.mjs` (watchdog + restart + confirm; its header has the commands,
// outputs and times). This file is the vite-node child it launches. Direct use, from the repo root
// (V = node node_modules/vite-node/vite-node.mjs):
//   V scripts/perf/complex/harness.ts -- --list                         the corpus, as one JSON line
//   V scripts/perf/complex/harness.ts -- [--from <k>] [--items "<id>,<id>"]        sweep (every action of each item)
//   V scripts/perf/complex/harness.ts -- --id <item id> --only <action> [--prof <file>.cpuprofile]   ONE action, alone
//       <action> = submit#<step> | another#<1..6> | load | edit | delete
// Also: --prod <events.jsonl> · --debug <debug-log.jsonl>. Prints one JSON line per action ({"ev":"begin"} before,
// {"ev":"m"} after) so sweep.mjs can kill a hang; it writes no file except a --prof profile.
//
// THE CACHES (#2888, ADR-CX-090): each corpus item is one student session — it starts from empty memos
// (clearComplexCaches) and stays warm; its load is cold again, as the work-meter gate's walk does it. The edit is
// measured last, in a session that has solved the lines before the edited one and not that one (editLastRowCx).
//
// WHAT IT MEASURES — all on the MAIN THREAD (there is no Worker anywhere in src-complex): submit / show-another /
// load / edit / delete. "render" = what App.tsx's useMemo chain recomputes after the store changes
// (deriveLines + coincidencesCx + realParamNotes + askRowsOf + buildScene); `parts` holds the split. The actions are
// src-complex/__tests__/work-meter/driverCx.ts — the one driver this harness and the work-meter gate share.
// CORPORA: src-complex/__tests__/fixtures, prod sessions (logs/perf-prod-events-complex.jsonl, else the log-triage
// pull logs/prod-events-complex.jsonl), the operator's dev sessions (logs/debug-log-complex.jsonl) and the
// hand-authored scaling probes below. A missing input is "no data" and its corpus is skipped.
//
// NO LLM (CLAUDE.md rule 2): only decideSubmitCx is called — a line it does not read is recorded as refused, never
// escalated — and `globalThis.fetch` is stubbed to throw right below the imports as a second lock.
//
// COMPARABILITY: every `ms` is a wall-clock timing — comparable only on a quiet machine. `work` is CLOCK-FREE and
// comparable anywhere: the work meter's three counts (#2873, ADR-W-210; #2888, ADR-CX-090) — executed line reads and exact solves in all, on the page's UI
// thread, and before the figure can paint — the same numbers the suite's gate holds a fixture to. `verdict` and
// `nLines` are deterministic too.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';
import { hydrateSession } from '../../../src-complex/app/submit';
import { clearComplexCaches } from '../../../src-complex/app/deriveLines';
// The actions themselves are the ONE driver this harness and the work-meter gate share (#2873).
import { anotherCx, applyLineCx, blankCx, editLastRowCx, loadCx, removeFirstCx, savedFileCx, sessionCx, submitCx, type ActionRecordCx } from '../../../src-complex/__tests__/work-meter/driverCx';

(globalThis as any).fetch = async () => {
  throw new Error('perf harness: network disabled (no LLM)');
};

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };

/** The rows of one JSONL input: the `flag` override, else the first existing candidate. Missing = "no data", never a crash. */
function corpusRows(flag: string, candidates: string[], what: string): any[] {
  const given = arg(flag);
  const file = given ? path.resolve(given) : candidates.map((c) => path.join(REPO, c)).find((f) => fs.existsSync(f));
  if (!file || !fs.existsSync(file)) {
    process.stderr.write(`no data: ${what} — ${given ?? candidates.join(' / ')} not found, corpus skipped\n`);
    return [];
  }
  const rows: any[] = [];
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { rows.push(JSON.parse(l)); } catch { /* a torn line is not data */ }
  }
  return rows;
}

interface Step { readonly u?: string; readonly action?: string; readonly detail?: string }
interface Item { readonly id: string; readonly source: string; readonly steps: readonly Step[]; readonly file?: unknown; readonly users?: string }

const norm = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------------------------- corpora
function corpus(): Item[] {
  const items: Item[] = [];
  const fx = path.join(REPO, 'src-complex/__tests__/fixtures');
  for (const f of fs.readdirSync(fx).filter((f) => f.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(fx, f), 'utf8'));
    items.push({ id: `fixture:${f.replace('.complex.json', '')}`, source: 'fixture', steps: (j.lines as string[]).map((u) => ({ u })), file: j });
  }
  // prod events: per sid, in order (submit + action), as triageReplayCx threads them
  const prod = corpusRows('--prod', ['logs/perf-prod-events-complex.jsonl', 'logs/prod-events-complex.jsonl'], 'prod sessions');
  const bySid = new Map<string, any[]>();
  for (const e of prod) if (e.ev === 'submit' || e.ev === 'action') (bySid.get(e.sid) ?? bySid.set(e.sid, []).get(e.sid)!).push(e);
  for (const [sid, evs] of bySid) {
    evs.sort((a, b) => String(a.t).localeCompare(String(b.t)));
    items.push({ id: `prod:${sid}`, source: 'prod', users: evs[0].iph, steps: evs.map((e) => (e.ev === 'action' ? { action: e.action, detail: e.detail } : { u: e.utterance })) });
  }
  const dbg = corpusRows('--debug', ['logs/debug-log-complex.jsonl'], 'dev debug-log sessions');
  const bySess = new Map<string, any[]>();
  for (const e of dbg) if (e.kind === 'input') (bySess.get(e.session) ?? bySess.set(e.session, []).get(e.session)!).push(e);
  for (const [s, evs] of bySess) {
    evs.sort((a, b) => a.seq - b.seq);
    items.push({ id: `debug:${s}`, source: 'debug', steps: evs.map((e) => ({ u: e.utterance })) });
  }
  for (const p of probes()) items.push(p);
  return items;
}

/** Plausible heavy shapes — hand-authored probes (the brief's list). Unreadable lines stay in and are reported as refused. */
function probes(): Item[] {
  const P = (id: string, lines: string[]): Item => ({ id: `probe:${id}`, source: 'probe', steps: lines.map((u) => ({ u })) });
  const many = Array.from({ length: 20 }, (_, k) => `z${k + 1} = ${k + 1}+${(k % 5) + 1}i`);
  const prods = Array.from({ length: 10 }, (_, k) => `w${k + 1} = z${k + 1}*z${k + 2}`);
  const capstone = ['arg z1 - arg z2 = 90', '|z1| = 9r', '|z2| = 12r', 'z2 ברביע הראשון', 'arg z2 < 45', '|z1-z2|', '|z3| = 20r', 'arg z3 + arg z2 = 0', 'המרובע Oz1z2z3', 'שטח Oz1z2z3 הוא 150r^2', 'היקף Oz1z2z3', 'z1, z2, z4 סדרה הנדסית', 'המרובע Oz2z3z4'];
  // scaling probes: how the cost grows with the line count (a pasted paragraph submits sentence by sentence)
  const named = (n: number) => Array.from({ length: n }, (_, k) => `z${k + 1} = ${k + 1}+${(k % 5) + 1}i`);
  const chain = (n: number) => Array.from({ length: n }, (_, k) => `|z${k + 1}| = ${k + 2}`).concat(Array.from({ length: n - 1 }, (_, k) => `arg z${k + 2} - arg z${k + 1} = 30`));
  const rchain = (n: number) => Array.from({ length: n }, (_, k) => `|z${k + 1}| = ${k + 1}r`).concat(['z1 ברביע הראשון', 'arg z2 < 45', 'arg z2 - arg z1 = 90'], Array.from({ length: n - 2 }, (_, k) => `arg z${k + 3} - arg z${k + 2} = 20`), Array.from({ length: Math.floor(n / 3) }, (_, k) => `המשולש Oz${3 * k + 1}z${3 * k + 2}`));
  const scale = [
    P('scale:named-40', named(40)), P('scale:named-80', named(80)),
    P('scale:chain-20', chain(20)), P('scale:chain-40', chain(40)),
    P('scale:chain-40+refuse', [...chain(40), '|z1| = 99']),
    P('scale:rchain-12', rchain(12)), P('scale:rchain-24', rchain(24)),
    P('scale:rchain-24+areas', [...rchain(24), 'שטח Oz1z2 הוא 54r^2', 'שטח Oz4z5 הוא 10']),
    P('scale:rchain-24+refuse', [...rchain(24), '|z1| = -5', 'arg z1 = 500']),
    P('scale:rchain-48+refuse', [...rchain(48), '|z1| = -5']), P('scale:named-160', named(160)),
    P('scale:polygons', ['|z1| = 3', '|z2| = 4', '|z3| = 5', '|z4| = 6', '|z5| = 7', 'arg z2 - arg z1 = 60', 'arg z3 - arg z2 = 60', 'arg z4 - arg z3 = 60', 'arg z5 - arg z4 = 60', 'המרובע Oz1z2z3', 'המרובע Oz2z3z4', 'המרובע Oz3z4z5', 'המשולש z1z3z5', 'המעגל החוסם את המשולש z1z3z5', 'המשולש z2z4z5', 'המעגל החוסם את המשולש z2z4z5', 'שטח Oz1z2z3 הוא 20', 'היקף המרובע Oz2z3z4 = 25']),
  ];
  return [
    ...scale,
    P('many-named-20', many),
    P('many-named-20+products', [...many, ...prods, 'המרובע z1z2z3z4', 'שטח z1z2z3z4', 'היקף z1z2z3z4']),
    P('free-many-10', Array.from({ length: 10 }, (_, k) => `|z${k + 1}| = ${k + 2}`).concat(Array.from({ length: 9 }, (_, k) => `arg z${k + 2} - arg z${k + 1} = 30`))),
    P('free-params-many', Array.from({ length: 8 }, (_, k) => `|z${k + 1}| = ${k + 1}r`).concat(['z1 ברביע הראשון', 'arg z2 < 45', 'המרובע Oz1z2z3', 'שטח Oz1z2z3 הוא 150r^2', 'היקף Oz1z2z3', 'אורך z1z2 = 15r'])),
    P('roots-deg12', ['z^12 = 1', '|z1|', 'w = z2*z3', 'z0 הוא הפתרון ברביע הרביעי']),
    P('roots-deg20', ['z^20 = 1+i', '|z|', 'arg z']),
    P('roots-deg24-poly', ['z^24 - 1 = 0', 'Re(z)']),
    P('roots-deg36', ['z^36 = 1']),
    P('roots-quartic+cubic', ['z^4 - 5z^2 + 4 = 0', 'w^3 = 8', 'u מספר מרוכב', 'u^6 = 64', 'z1 = 2', '|z1-w1|']),
    P('roots-many-equations', ['z^5 = 32', 'w^6 = 64', 'u מספר מרוכב', 'u^7 = 1', 'v מספר מרוכב', 'v^8 = 256']),
    P('loci-combined', ['|z1| = 5', 'arg z1 < 60', 'z1 ברביע הראשון', 'Re(z1) = 3', '|z2| = 2|z1|', 'arg z2 - arg z1 = 90', '|z1-z2|', 'המעגל שמרכזו O ורדיוסו 5', 'Im(z2) > 0', 'z3 = conj(z1)', 'המשולש z1z2z3', 'המעגל החוסם את המשולש z1z2z3']),
    P('loci-param', ['|z1| = r', '|z2| = 2r', '|z3| = 3r', 'arg z1 = 30', 'arg z2 - arg z1 = 60', 'arg z3 - arg z2 = 60', 'המרובע Oz1z2z3', 'שטח Oz1z2z3 הוא 50', 'z1*conj(z1) + z2*conj(z2) = 25']),
    P('sets-regions', ['z ברביע הראשון', '|z| < 5', '|z - 1| = 2', 'Re(z) > 1', 'arg z < 45', 'Im(z) > 0']),
    P('sequences', ['z1 = 1+i', 'z1, z2, z3 סדרה הנדסית', 'z2 = 2i', 'z3, z4, z5 סדרה חשבונית', 'z5 = 4', 'לכל n טבעי, w^(4n) ממשי', 'ה-n המינימלי שעבורו w^n מדומה טהור הוא 2']),
    P('capstone+contradiction', [...capstone, '|z1| = 5', 'arg z2 = 80']),
    P('capstone-x2', [...capstone, '|z5| = 7r', 'arg z5 + arg z1 = 0', 'המרובע Oz1z4z5', 'שטח Oz1z4z5', 'z2, z3, z6 סדרה הנדסית', 'היקף Oz2z3z6']),
    P('example-lines', ['w1 = 3+4i', 'w2 = 2cis150', 'w = w1*w2', 'z^5 = w^2', 'z1 ברביע הראשון', 'המחומש z1z2z3z4z5', 'שטח z1z2z3z4z5']),
    P('symbolic-cart-many', ['z1 = a+bi', 'z2 = c+di', 'z3 = e+fi', '|z1| = 5', '|z2| = |z1|', 'z1 ברביע השני', 'z2 ברביע הרביעי', 'z3 = z1*z2', 'Re(z3)']),
  ];
}

// ---------------------------------------------------------------------------------------------- timing
const PROF = arg('--prof');
let warming = false;
let profSession: Session | null = null;
const out = (o: any) => {
  if (PROF && !warming && o.ev === 'begin') {
    profSession = new Session();
    profSession.connect();
    profSession.post('Profiler.enable');
    profSession.post('Profiler.setSamplingInterval', { interval: 500 });
    profSession.post('Profiler.start');
  } else if (profSession && o.ev === 'm') {
    const sess = profSession;
    profSession = null;
    sess.post('Profiler.stop', (err, res) => {
      if (!err) {
        fs.mkdirSync(path.dirname(path.resolve(PROF!)), { recursive: true });
        fs.writeFileSync(PROF!, JSON.stringify(res.profile));
      }
      sess.disconnect();
    });
  }
  process.stdout.write(JSON.stringify(o) + '\n');
};
const r1 = (x: number) => Math.round(x * 10) / 10;

/** One action's record: the driver's times (rounded) and the work meter's three counts. */
const shown = (r: ActionRecordCx) => ({ ms: r1(r.ms), parts: Object.fromEntries(Object.entries(r.parts).map(([k, x]) => [k, r1(x)])), ...(r.verdict !== undefined ? { verdict: r.verdict } : {}), nLines: r.nLines, ...(r.audit !== undefined ? { audit: r.audit } : {}), work: r.work });

function runItem(it: Item, opts: { only?: string }) {
  // #2888 (ADR-CX-090): an item is one session. It starts from empty memos and stays warm, as the gate's walk does.
  clearComplexCaches();
  const s = blankCx();
  const prefix: string[] = [];
  const want = (kind: string) => !opts.only || opts.only === kind;
  const tag = { item: it.id, source: it.source, users: it.users };
  let stepNo = 0;
  for (const st of it.steps) {
    stepNo++;
    if (st.action) {
      if (st.action === 'show-another') s.seed += 1;
      prefix.push(`[action:${st.action}]`);
      continue; // edit in prod (1 event): its new text is the logged detail — degraded, as triage marks it
    }
    const u = norm(st.u);
    if (!u) continue;
    prefix.push(u);
    if (opts.only && opts.only !== `submit#${stepNo}`) {
      applyLineCx(s, u);
      continue;
    }
    out({ ev: 'begin', item: it.id, kind: 'submit', step: stepNo });
    out({ ev: 'm', ...tag, kind: 'submit', step: stepNo, seq: [...prefix], ...shown(submitCx(s, u)), thread: 'main' });
  }
  if (s.lines.length === 0 || opts.only?.startsWith('submit')) return;
  // show another ×6 on the final figure
  const seed0 = s.seed;
  for (let k = 1; k <= 6; k++) {
    if (want(`another#${k}`)) {
      out({ ev: 'begin', item: it.id, kind: 'another', step: k });
      out({ ev: 'm', ...tag, kind: 'another', step: k, seq: [...prefix], ...shown(anotherCx(s, seed0 + k)), thread: 'main' });
    }
  }
  s.seed = seed0;
  // load: a cold hydrate of the saved file (the fixture itself, or the final state as a save would write it)
  const file = it.file ?? savedFileCx(s);
  // the load is COLD: a saved file opened in a new session (the delete after it is that session's)
  clearComplexCaches();
  if (want('load')) {
    out({ ev: 'begin', item: it.id, kind: 'load', step: 0 });
    out({ ev: 'm', ...tag, kind: 'load', step: 0, seq: [...prefix], ...shown(loadCx(file)), thread: 'main' });
  } else hydrateSession(file);
  const loaded = sessionCx();
  if (want('delete')) {
    out({ ev: 'begin', item: it.id, kind: 'delete', step: 0 });
    const r = removeFirstCx();
    if (r) out({ ev: 'm', ...tag, kind: 'delete', step: 0, seq: [...prefix], ...shown(r), thread: 'main' });
  }
  if (want('edit')) {
    // LAST, in a session of its own (the work meter's definition, #2888): the lines before the last are solved, the
    // edited one is not. editLine's gateChange path (config tries + blame on failure) on the last line's own text.
    out({ ev: 'begin', item: it.id, kind: 'edit', step: loaded.lines.length - 1 });
    const r = editLastRowCx(loaded);
    if (r) out({ ev: 'm', ...tag, kind: 'edit', step: r.nLines - 1, seq: [...prefix], ...shown(r), thread: 'main' });
  }
}

// ---------------------------------------------------------------------------------------------- main
const items = corpus();
if (argv.includes('--list')) {
  out({ ev: 'list', n: items.length, items: items.map((i) => ({ id: i.id, source: i.source, n: i.steps.length })) });
} else {
  // warm-up (JIT + module init), unrecorded
  const save = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = () => true;
  warming = true;
  runItem({ id: 'warm', source: 'warm', steps: ['w1 = 3+4i', 'z^5 = w1^2', '|z1| = 9r'].map((u) => ({ u })) }, {});
  warming = false;
  (process.stdout as any).write = save;
  const only = arg('--only');
  const id = arg('--id');
  if (id) {
    const it = items.find((i) => i.id === id);
    if (it) runItem(it, { only });
    else out({ ev: 'nodata', id });
  } else {
    const from = Number(arg('--from') ?? 0);
    // --items "<id>,<id>": only those corpus items (their index k stays the index in the full corpus)
    const wanted = arg('--items')?.split(',');
    for (let k = from; k < items.length; k++) {
      if (wanted && !wanted.includes(items[k].id)) continue;
      out({ ev: 'item', k, id: items[k].id });
      runItem(items[k], {});
    }
  }
  out({ ev: 'done' });
}
