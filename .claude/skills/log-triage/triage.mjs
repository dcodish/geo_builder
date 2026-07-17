#!/usr/bin/env node
/**
 * log-triage — one pipeline: fetch the PROD usage log(s), bucket every real user
 * utterance by outcome, then RE-RUN each candidate against the CURRENT code so items
 * we've already fixed drop off the list automatically. Same report shape for both apps
 * (2-D Geo Builder + 3-D Space Builder).
 *
 * MUST be run with vite-node (it imports the TS parsers/builders):
 *   npx vite-node .claude/skills/log-triage/triage.mjs --app 3d
 *   npx vite-node .claude/skills/log-triage/triage.mjs --app 2d --days 30
 *   npx vite-node .claude/skills/log-triage/triage.mjs --app both --no-fetch
 *
 * Prod events (ADR-3D-016): /var/www/geo-proxy/events.jsonl (2-D) + events-3d.jsonl (3-D).
 * Each `submit` line: { serverTs, iph(hashed IP), ev, sid, rel, utterance, locale, source, result }.
 * Outcome classification MIRRORS server/admin.ts (outcomeOf2D / outcomeOf3D).
 *
 * VERIFY = THE APP'S SUBMIT PATH, NOT A LONE `parse()` ([ADR-346](../../../docs/06-decisions.md#adr-346),
 * issue #35). The verifier used to call `parse(u)` context-free and skip every honesty/scope gate, so it
 * reported as "LIVE grammar gaps" (a) everything needing a prior figure — `גובה מ B`, `אלכסונים`, the whole
 * tangent-from-external family — and (b) everything the App answers with a GUIDED refusal. The distortion is
 * not uniform: the context-dependent constructs are exactly the recently-fixed ones, so FIXED WORK FLOATED TO
 * THE TOP of the very ranking the skill says to trust. Two runs (2026-07-11, 2026-07-17) burned most of a
 * session re-checking by hand. So this file now mirrors `App.tsx#submit`, in its order:
 *
 *   store ops (nameCentre/rename/merge/swap) → parse(u, buildParseCtx(figure)) → clarify (ambiguous-*)
 *   → PRE_LLM out-of-scope short-circuit (ADR-289) → honesty gates (ADR-089/250/264/292 + #153)
 *   → replay → built / refused
 *
 * `buildParseCtx` is IMPORTED, never re-implemented — that mirror drifting is what this file is a fix for,
 * and `src/parser/context.ts`'s own header documents the same class (its ADR-169 `parallels` drift). When
 * the App's submit path gains a gate, ADD IT HERE — a missing gate is a false gap, silently.
 *
 * Session context: each session's (`sid`) submits are replayed IN ORDER, threading ONE figure forward (one
 * `replay` per step, reused for both the context and the `before` figure — the naive prefix-replay-per-step
 * is O(n²) and never finished a full sweep). A step that doesn't build leaves the figure untouched (the App's
 * keep-prior). Our grammar failing a step does NOT by itself break the prefix: when the log carries what the
 * LLM committed (`commands`, issue #84), that is replayed instead, so the verdict reports OUR coverage
 * honestly while the rest of the session stays real evidence. Where we genuinely cannot follow — an LLM step
 * with no logged commands (pre-2026-07-14 events; all of 3-D until #182) or a store `action` this replay
 * cannot reproduce (edit/delete/show-another/slider; clear/undo/redo ARE followed since #189) — the rest
 * of the session is marked DEGRADED: our figure is missing objects the student had,
 * so a downstream failure may be OUR artifact. Degraded failures are reported separately and NEVER claimed as
 * gaps — that is the same false-signal class this file exists to kill. An utterance is judged by its BEST
 * outcome over all its occurrences: if it builds in any real context, it is not a gap.
 *
 * INCREMENTAL (operator ruling 2026-07-17, [ADR-346](../../../docs/06-decisions.md#adr-346) Am. 2) — two
 * separate problems, deliberately solved differently:
 *   COST. Session verdicts are cached in `logs/triage-state-<app>.json` (gitignored: raw utterances stay out
 *     of git per this skill's privacy posture, and a fresh machine simply does one full run). A later run
 *     replays only sessions that are NEW, that grew, or that hold a STILL-OPEN row (the set whose verdict can
 *     actually improve). Sessions where everything already builds are trusted from cache — a regression there
 *     is the test suite's job, not triage's. `--reverify` forces the full sweep.
 *   NOISE. Counts stay ALL-TIME — a naive "only new events" watermark would reset distinct-user counts each
 *     window, so a slow-burning cluster (3 users over 3 months) would read as 1 user and rank low, breaking
 *     the skill's core prioritization rule. Instead the LIVE worklist SPLITS: rows never reported before are
 *     ▶ NEW; rows surfaced in an earlier run collapse into ↩ carried-over with their first-seen date.
 *
 * Options: --server root@themathbible.com  --remote-dir /var/www/geo-proxy
 *          --days N (0=all)  --release <substr>  --top 80  --no-fetch  --no-verify
 *          --session-budget-ms N (default 60000; overrun → honest `unverified`, never a silent drop)
 *          --reverify (ignore the session cache)  --no-state (don't read or write the state file)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  parse, parseRename, parseMerge, parseSwap, parseNameCenter, impliedCircleBinding, buildParseCtx, classifyOutOfScope,
  droppedNewLabels, droppedGivenNumbers, droppedGivenRelations, droppedGivenVerbs, droppedCompoundRelation,
} from '../../../src/parser/index.ts';
import { replay, nameCentreFacts } from '../../../src/store/geoStore.ts';
import { parse3 } from '../../../src3d/parser/parse3.ts';
import { derive3 } from '../../../src3d/store/store3.ts';

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const app = opt('--app', 'both');
const days = Number(opt('--days', '0')) || 0;
const server = opt('--server', 'root@themathbible.com');
const remoteDir = opt('--remote-dir', '/var/www/geo-proxy');
const top = Number(opt('--top', '80'));
const release = opt('--release', '');
const noFetch = has('--no-fetch');
const noVerify = has('--no-verify');
const reverify = has('--reverify');
const noState = has('--no-state');
const sessionBudgetMs = Number(opt('--session-budget-ms', '60000'));

const repoRoot = path.resolve(process.cwd());
const cacheDir = path.join(repoRoot, 'logs'); // gitignored
const reportsDir = path.join(repoRoot, 'reports'); // gitignored
mkdirSync(cacheDir, { recursive: true });
mkdirSync(reportsDir, { recursive: true });

const APPS = app === 'both' ? ['2d', '3d'] : [app];
const REMOTE = { '2d': 'events.jsonl', '3d': 'events-3d.jsonl' };
const LOCAL = { '2d': path.join(cacheDir, 'prod-events-2d.jsonl'), '3d': path.join(cacheDir, 'prod-events-3d.jsonl') };

// ---- outcome classification (mirror of server/admin.ts) ------------------
function outcome2D(e) {
  const r = e.result ?? 'ok';
  if (e.source === 'scope') return 'out-of-scope';
  if (e.source === 'limit') return 'throttled';
  if (e.source === 'llm') return r === 'ok' ? 'llm-built' : 'not-understood';
  if (e.source === 'parser') return r === 'deferred-constraint' ? 'deferred' : 'parsed';
  return 'other';
}
function outcome3D(e) {
  const r = e.result ?? 'ok';
  if (e.source === 'llm') return r === 'ok' ? 'llm-built' : 'not-understood';
  if (r === 'ok') return 'parsed';
  if (r === 'not-understood') return 'not-understood';
  return 'refused';
}
const classify = (a, e) => (a === '2d' ? outcome2D(e) : outcome3D(e));
// buckets that carry a "what's missing" signal, in priority order
const INTERESTING = ['not-understood', 'llm-built', 'refused', 'out-of-scope'];

// ---- fetch ---------------------------------------------------------------
function fetch(a) {
  if (noFetch) { if (!existsSync(LOCAL[a])) throw new Error(`--no-fetch but no cache at ${LOCAL[a]}`); return; }
  const src = `${server}:${remoteDir}/${REMOTE[a]}`;
  process.stderr.write(`fetching ${src}\n`);
  execFileSync('scp', ['-q', src, LOCAL[a]], { stdio: ['ignore', 'ignore', 'inherit'] });
}

// ---- load + dedup --------------------------------------------------------
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
function load(a) {
  const lines = readFileSync(LOCAL[a], 'utf8').split('\n').filter(Boolean);
  const cutoff = days > 0 ? Date.now() - days * 86400_000 : 0;
  const events = [];
  const sessions = new Set(), visitors = new Set();
  for (const ln of lines) {
    let e; try { e = JSON.parse(ln); } catch { continue; }
    if (cutoff && e.serverTs && Date.parse(e.serverTs) < cutoff) continue;
    if (release && !(e.rel ?? '').includes(release)) continue;
    if (e.ev === 'session') { if (e.iph) visitors.add(e.iph); continue; }
    // `action` events (issue #84: edit / delete / show-another) are NOT submits — they never enter the
    // stats or the candidate list — but they DO move the student's figure, so the session replay must see
    // them to know when its prefix stops being faithful. Kept in `events`, filtered out of the counts.
    if (e.ev !== 'submit' && e.ev !== 'action') continue;
    if (e.ev === 'action') { events.push(e); continue; }
    if (e.sid) sessions.add(e.sid);
    if (e.iph) visitors.add(e.iph);
    events.push(e);
  }
  return { events, submits: events.filter((e) => e.ev === 'submit'), sessions: sessions.size, visitors: visitors.size };
}

// ---- incremental state (ADR-346 Am. 2) -----------------------------------
// Gitignored, per-machine: raw utterances stay out of git (this skill's privacy posture), and a fresh
// machine just does one full run. Deliberately minimal — it holds ONLY what cannot be re-derived from the
// log: per-session verdicts (the COST half) and a `reportedAt` stamp per utterance (the NOISE half —
// "have we already put this in front of the operator?"). First-seen is NOT stored: it comes from the
// events, so it is stable across runs and machines and honest on a first run over an all-time log.
const STATE = (a) => path.join(cacheDir, `triage-state-${a}.json`);
const loadState = (a) => {
  if (noState) return { version: 1, lastRun: null, sessions: {}, utterances: {} };
  try {
    const s = JSON.parse(readFileSync(STATE(a), 'utf8'));
    if (s.version === 1) return s;
  } catch { /* first run / unreadable / stale schema → start clean */ }
  return { version: 1, lastRun: null, sessions: {}, utterances: {} };
};
const saveState = (a, s) => { if (!noState && !noVerify) writeFileSync(STATE(a), JSON.stringify(s)); };
const headRev = (() => {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return '?'; }
})();
/** Verdicts whose answer can still IMPROVE as code lands — their sessions are always re-replayed. The rest
 *  (built / store-op / guided / built-nothing / clarify / skip) are trusted from cache until `--reverify`:
 *  a REGRESSION in already-working input is what the test suite is for, not what triage is for. */
const OPEN = new Set(['not-handled', 'would-escalate', 'refused', 'error', 'unverified']);

// ---- verify: replay each SESSION through the App's submit path ------------
// The categories App.tsx#submit refuses with a GUIDED message BEFORE ever paying for an LLM call
// (ADR-289 / #43). Not gaps — the tool answering on purpose. Keep in sync with App.tsx's PRE_LLM.
const PRE_LLM = new Set(['analytic', 'cross-app', 'ui-command', 'valueless-query', 'orientation', 'bare-point', 'unnamed-sides', 'compound-relation']);

/** The five honesty gates of App.tsx#submit, in its order. Any hit ⇒ the App escalates to the LLM
 *  instead of committing the partial parse — so the deterministic grammar does NOT own this utterance. */
function droppedBy(u, cmds, pctx) {
  const hits = [
    ...droppedNewLabels(u, cmds, pctx.points ?? [], (pctx.radiusSymbols ?? []).map((x) => x.name)), // ADR-089
    ...droppedGivenNumbers(u, cmds),      // ADR-250
    ...droppedGivenRelations(u, cmds),    // ADR-264
    ...droppedGivenVerbs(u, cmds),        // ADR-292
    ...droppedCompoundRelation(u, cmds),  // #153/#145
  ];
  return hits.map(String);
}

/** The canonical commands the LLM actually committed, logged since issue #84 (a JSON string): 2-D carries
 *  engine COMMAND OBJECTS (since 2026-07-14), 3-D the canonical LINES submitSteps re-parsed (#182, since
 *  2026-07-17). Lets the replay follow a step our grammar can't reproduce, keeping the PREFIX faithful —
 *  the difference between "the rest of this session is unverifiable" and real evidence. Absent on older
 *  events, which is exactly when `degraded` still fires. */
const loggedCommands = (e) => {
  if (e.source !== 'llm' || e.result !== 'ok' || !e.commands) return null;
  try {
    const c = typeof e.commands === 'string' ? JSON.parse(e.commands) : e.commands;
    return Array.isArray(c) && c.length ? c : null;
  } catch { return null; }
};

/** One 2-D session, in order, threading ONE figure forward. Returns an outcome per event index. */
function session2d(evs) {
  const out = [];
  let facts = [];
  let fig;
  try { fig = replay([], 0); } catch { fig = { construction: { objects: [], points: new Map() }, positions: new Map(), status: {} }; }
  let degraded = false; // our prefix ≠ the user's figure ⇒ nothing downstream is evidence
  // #189: a zundo-like history so logged clear/undo/redo actions are FOLLOWED, not degraded — one
  // entry per fact-list mutation, mirroring the store's per-set() undo granularity.
  const history = [];
  let future = [];
  const advance = (next, d) => { history.push(facts); future = []; facts = next; if (d) fig = d; };
  const t0 = Date.now();
  for (const e of evs) {
    if (e.ev === 'action') {
      // #189: clear / undo / redo are logged since prod/2026-07-17-3 and this replay FOLLOWS them, so
      // the prefix stays faithful. An undo/redo reaching past what this session tracked (or any other
      // action — edit / delete / show-another / slider, whose reshaping we can't reproduce) still
      // degrades honestly.
      if (e.action === 'clear') { advance([], replay([], 0)); out.push({ now: 'skip', detail: 'action:clear', degraded }); continue; }
      if (e.action === 'undo') {
        if (history.length) { future.push(facts); facts = history.pop(); fig = replay(facts, 0); out.push({ now: 'skip', detail: 'action:undo', degraded }); }
        else { degraded = true; out.push({ now: 'skip', detail: 'action:undo (past tracked history)', degraded }); }
        continue;
      }
      if (e.action === 'redo') {
        if (future.length) { history.push(facts); facts = future.pop(); fig = replay(facts, 0); out.push({ now: 'skip', detail: 'action:redo', degraded }); }
        else { degraded = true; out.push({ now: 'skip', detail: 'action:redo (past tracked history)', degraded }); }
        continue;
      }
      degraded = true; out.push({ now: 'skip', detail: `action:${e.action}`, degraded }); continue;
    }
    const u = norm(e.utterance);
    if (!u) { out.push({ now: 'skip', detail: '', degraded }); continue; }
    if (Date.now() - t0 > sessionBudgetMs) { out.push({ now: 'unverified', detail: 'session budget', degraded: true }); continue; }
    let pctx = {};
    try { pctx = buildParseCtx(fig.construction, fig.positions); } catch { pctx = {}; }
    let res;
    try {
      // Store operations run BEFORE the parser in submit — a rename/merge/swap/name-centre is not a
      // geometry command and must never be counted as a grammar gap.
      if (parseNameCenter(u, pctx) || parseRename(u) || parseMerge(u) || parseSwap(u)) {
        res = { now: 'store-op', detail: 'rename/merge/swap/name-centre' };
      } else {
        let r = parse(u, pctx);
        // #186 mirror: a circle referenced by a name that matches no circle, with UNNAMED circles in the
        // figure, BINDS the fresh name to one of them (App.submit's auto-bind: `impliedCircleBinding` →
        // `nameCentreFacts` → re-parse); ambiguous → the same clarify the App shows.
        let bindClarify = null;
        for (let guard = 0; r.ok && guard < 3; guard++) {
          const bind = impliedCircleBinding(r.commands, pctx);
          if (!bind) break;
          if (bind.clarify) { bindClarify = bind.center; break; }
          const nc = nameCentreFacts(facts, bind.from, bind.to);
          if (!nc.ok) break;
          advance(nc.facts, replay(nc.facts, 0)); // #189: its own history entry (the store's nameCentre set())
          pctx = buildParseCtx(fig.construction, fig.positions);
          r = parse(u, pctx);
        }
        if (bindClarify) {
          res = { now: 'clarify', detail: `unknown-circle:${bindClarify}` };
        } else if (!r.ok && (r.reason === 'ambiguous-angle' || r.reason === 'ambiguous-circle')) {
          res = { now: 'clarify', detail: r.reason };
        } else if (!r.ok) {
          const oos = classifyOutOfScope(u);
          res = oos && PRE_LLM.has(oos.category)
            ? { now: 'guided', detail: `scope:${oos.category}` }
            : { now: 'not-handled', detail: oos ? `${r.reason} (scope:${oos.category})` : r.reason };
        } else {
          const dropped = droppedBy(u, r.commands, pctx);
          if (dropped.length) {
            res = { now: 'would-escalate', detail: `dropped:${dropped.join(',').slice(0, 40)}` };
          } else {
            const next = [...facts, ...r.commands.map((cmd, k) => ({ id: `f${facts.length}-${k}`, group: `g${out.length}`, cmd, enabled: true }))];
            const d = replay(next, 0);
            const bad = Object.entries(d.status).find(([, v]) => v !== 'ok' && v !== 'disabled');
            if (bad) res = { now: 'refused', detail: String(typeof bad[1] === 'string' ? bad[1] : bad[1]?.code ?? 'err').slice(0, 60) };
            else if (d.positions.size === 0) res = { now: 'built-nothing', detail: r.commands.map((c) => c.type).join(',') };
            else { res = { now: 'built', detail: r.commands.map((c) => c.type).join(',') }; advance(next, d); } // advance only on success (keep-prior)
          }
        }
      }
    } catch (err) { res = { now: 'error', detail: String(err?.message ?? err).slice(0, 70) }; }
    out.push({ ...res, degraded });
    if (res.now === 'built' || res.now === 'store-op' || res.now === 'skip') continue; // prefix stays faithful
    // Our grammar didn't land this step — but the student's figure DID advance (the LLM built it). If the
    // log carries what the LLM committed (#84), replay THAT so the prefix keeps matching what they saw:
    // the verdict above still reports our own coverage honestly (an `llm-built` row our grammar misses is
    // still a LIVE gap), while the rest of the session stays real evidence instead of collapsing to
    // `degraded`. Without the logged commands — pre-#84 events, and all of 3-D (#182) — we cannot follow.
    const cmds = loggedCommands(e);
    if (!cmds) { degraded = true; continue; }
    try {
      const next = [...facts, ...cmds.map((cmd, k) => ({ id: `L${facts.length}-${k}`, group: `lg${out.length}`, cmd, enabled: true }))];
      const d = replay(next, 0);
      const bad = Object.entries(d.status).find(([, v]) => v !== 'ok' && v !== 'disabled');
      if (bad) degraded = true; // the logged commands don't replay cleanly here — don't pretend they did
      else advance(next, d);
    } catch { degraded = true; }
  }
  return out;
}

/** One 3-D session. `parse3` is context-free BY DESIGN (it takes no ParseContext — App3 mirrors that), so
 *  only the BUILD needs the session prefix: the `unknown-point` refusals are prefix artifacts, not gaps.
 *  Since #182 the 3-D sink logs `action` lines + the LLM's committed canonical LINES (`commands`), so this
 *  replay FOLLOWS clear/undo/redo and llm-built steps exactly like `session2d` — degradation is reserved
 *  for what we genuinely cannot reproduce (delete / show-another / load, pre-#182 llm steps). */
function session3d(evs) {
  const out = [];
  let facts = [];
  let degraded = false;
  const history = [];
  let future = [];
  const advance = (next) => { history.push(facts); future = []; facts = next; };
  const t0 = Date.now();
  for (const e of evs) {
    if (e.ev === 'action') {
      if (e.action === 'clear') { advance([]); out.push({ now: 'skip', detail: 'action:clear', degraded }); continue; }
      if (e.action === 'undo') {
        if (history.length) { future.push(facts); facts = history.pop(); out.push({ now: 'skip', detail: 'action:undo', degraded }); }
        else { degraded = true; out.push({ now: 'skip', detail: 'action:undo (past tracked history)', degraded }); }
        continue;
      }
      if (e.action === 'redo') {
        if (future.length) { history.push(facts); facts = future.pop(); out.push({ now: 'skip', detail: 'action:redo', degraded }); }
        else { degraded = true; out.push({ now: 'skip', detail: 'action:redo (past tracked history)', degraded }); }
        continue;
      }
      degraded = true; out.push({ now: 'skip', detail: `action:${e.action}`, degraded }); continue;
    }
    const u = norm(e.utterance);
    if (!u) { out.push({ now: 'skip', detail: '', degraded }); continue; }
    if (Date.now() - t0 > sessionBudgetMs) { out.push({ now: 'unverified', detail: 'session budget', degraded: true }); continue; }
    let res;
    try {
      const r = parse3(u);
      if (!r.ok) res = { now: 'not-handled', detail: r.reason };
      else {
        const id = `f${facts.length}`;
        const next = [...facts, { id, utterance: u, cmds: r.commands, enabled: true }];
        const d = derive3(next, 0);
        const st = d.status[id];
        if (st && st !== 'ok' && st !== 'disabled') res = { now: 'refused', detail: (typeof st === 'string' ? st : st.code ?? JSON.stringify(st)).slice(0, 60) };
        else if (d.positions.size === 0) res = { now: 'built-nothing', detail: r.commands.map((c) => c.type).join(',') };
        else { res = { now: 'built', detail: r.commands.map((c) => c.type).join(',') }; advance(next); }
      }
    } catch (err) { res = { now: 'error', detail: String(err?.message ?? err).slice(0, 70) }; }
    out.push({ ...res, degraded });
    if (res.now === 'built' || res.now === 'skip') continue;
    // Our grammar didn't land this step — follow what the LLM actually committed (#182: the canonical
    // LINES, re-parsed through parse3 so parser drift is caught, the scenarios' mocked-LLM form). The
    // verdict above still reports OUR coverage honestly; only the prefix stays faithful.
    const lines = loggedCommands(e);
    if (!lines || !lines.every((l) => typeof l === 'string')) { degraded = true; continue; }
    try {
      let next = facts;
      let ok = true;
      for (const line of lines) {
        const lr = parse3(norm(line));
        if (!lr.ok) { ok = false; break; }
        next = [...next, { id: `L${next.length}`, utterance: line, cmds: lr.commands, enabled: true }];
      }
      const d = ok ? derive3(next, 0) : null;
      const bad = d && Object.entries(d.status).find(([, v]) => v !== 'ok' && v !== 'disabled');
      if (!ok || bad) degraded = true; // the logged lines don't replay cleanly here — don't pretend they did
      else advance(next);
    } catch { degraded = true; }
  }
  return out;
}

/** Replay every session of an app; return normalized-utterance → the outcomes it got across sessions.
 *  Sessions are re-replayed only when NEW, GROWN, or holding a still-open row (ADR-346 Am. 2). */
function verifyAll(a, events, state) {
  const bySid = new Map();
  for (const e of events) {
    const sid = e.sid ?? '(nosid)';
    if (!bySid.has(sid)) bySid.set(sid, []);
    bySid.get(sid).push(e);
  }
  const byUtterance = new Map();
  let done = 0, replayed = 0, cached = 0;
  for (const [sid, evs] of bySid) {
    const prior = state.sessions[sid];
    // Trust the cache only for a session that is unchanged AND fully settled. Any open row ⇒ re-replay:
    // that is exactly the "did we fix it since?" question this tool exists to answer.
    const reusable = !reverify && prior && prior.n === evs.length && !prior.outs.some((o) => OPEN.has(o.now));
    let outs;
    if (reusable) { outs = prior.outs; cached++; }
    else { outs = (a === '2d' ? session2d : session3d)(evs); replayed++; }
    state.sessions[sid] = { n: evs.length, rev: reusable ? prior.rev : headRev, at: reusable ? prior.at : new Date().toISOString(), outs };
    outs.forEach((o, i) => {
      if (evs[i].ev !== 'submit') return; // `action` rows exist only to degrade the prefix, never to be judged
      const key = norm(evs[i].utterance) || '(empty)';
      if (!byUtterance.has(key)) byUtterance.set(key, []);
      byUtterance.get(key).push(o);
    });
    if (++done % 10 === 0) process.stderr.write(`  ${a}: ${done}/${bySid.size} sessions (${replayed} replayed, ${cached} cached)\n`);
  }
  return { byUtterance, replayed, cached };
}

// Best-outcome rank: if an utterance works in ANY real session context, it is not a gap.
const RANK = ['built', 'store-op', 'built-nothing', 'clarify', 'guided', 'would-escalate', 'refused', 'not-handled', 'error', 'unverified', 'skip'];
function bestOutcome(outs) {
  if (!outs?.length) return { now: 'unverified', detail: 'no occurrence', degraded: true };
  // Prefer verdicts from a FAITHFUL prefix; a degraded-prefix failure is our artifact, not evidence.
  const clean = outs.filter((o) => !o.degraded);
  const pool = clean.length ? clean : outs;
  const best = [...pool].sort((x, y) => RANK.indexOf(x.now) - RANK.indexOf(y.now))[0];
  return { ...best, degraded: !clean.length };
}

// ---- per-app report ------------------------------------------------------
function reportFor(a) {
  // `events` carries submits AND the store `action` rows (needed by the session replay); every STAT and
  // candidate below is over `submits` only, so the counts stay comparable to server/admin.ts.
  const { events, submits, sessions, visitors } = load(a);
  const byBucket = {};
  for (const e of submits) (byBucket[classify(a, e)] ??= []).push(e);
  const total = submits.length;
  const counts = Object.fromEntries(Object.entries(byBucket).map(([b, arr]) => [b, arr.length]));

  // dedup the interesting buckets, then verify each distinct utterance against HEAD
  const cands = [];
  for (const bucket of INTERESTING) {
    const arr = byBucket[bucket] ?? [];
    const map = new Map();
    for (const e of arr) {
      const key = norm(e.utterance) || '(empty)';
      const rec = map.get(key) ?? { count: 0, iphs: new Set(), codes: new Set(), locales: new Set(), first: null };
      rec.count++; if (e.iph) rec.iphs.add(e.iph);
      if (e.result && e.result !== 'ok') rec.codes.add(e.result); if (e.locale) rec.locales.add(e.locale);
      // First-seen comes from the LOG, not from when we happened to run: authoritative, stable across runs
      // and machines, and honest on a first run over an all-time log (stamping "today" would claim a row
      // months old was seen this morning). Nothing to persist — it is re-derived every time.
      const ts = (e.serverTs ?? '').slice(0, 10);
      if (ts && (!rec.first || ts < rec.first)) rec.first = ts;
      map.set(key, rec);
    }
    for (const [u, r] of map) cands.push({ u, bucket, count: r.count, users: r.iphs.size, codes: [...r.codes], locales: [...r.locales], firstSeen: r.first });
  }
  // Verify by replaying every session in order (the App's submit path, in context), then judge each
  // distinct utterance by its BEST outcome across occurrences (ADR-346).
  const state = loadState(a);
  const prevRun = state.lastRun;
  const { byUtterance, replayed, cached } = noVerify
    ? { byUtterance: new Map(), replayed: 0, cached: 0 }
    : verifyAll(a, events, state);
  // `firstSeen` is already derived from the log above. The ONLY thing that needs persisting is whether we
  // have put this row in front of the operator before — "carried over" means *we already reported it*, not
  // merely that it existed in the log.
  for (const c of cands) {
    c.verify = noVerify ? { now: '?', detail: '' } : bestOutcome(byUtterance.get(c.u));
    c.reportedAt = state.utterances[c.u]?.reportedAt ?? null;
  }

  // sort each candidate into a REPORT bucket by its CURRENT (post-fix) outcome
  const live = [], fixed = [], context = [], review = [], guided = [], escalate = [], unverified = [];
  for (const c of cands) {
    const now = c.verify.now;
    if (c.u === '(empty)') continue;
    // A verdict reached only through a DEGRADED prefix (a prior step of that session didn't replay here,
    // so our figure ≠ the student's) is not evidence of anything — never let it become a "gap".
    if (c.verify.degraded && (now === 'not-handled' || now === 'refused' || now === 'error')) unverified.push(c);
    else if (now === 'unverified') unverified.push(c);
    else if (now === 'not-handled') live.push(c); // still a real grammar gap (the App would escalate to the LLM)
    else if (now === 'built' || now === 'store-op') fixed.push(c); // already fixed since the user hit it
    else if (now === 'guided') guided.push(c); // deliberately out-of-scope: the App answers with guidance (ADR-289)
    else if (now === 'would-escalate') escalate.push(c); // parses, but an honesty gate sends it to the LLM
    else if (now === 'built-nothing') context.push(c); // parses but adds nothing (M1 / re-declaration)
    else review.push(c); // refused/clarify/error — a reasoned code
  }
  const byUsers = (x, y) => y.users - x.users || y.count - x.count;
  for (const arr of [live, fixed, context, review, guided, escalate, unverified]) arr.sort(byUsers);

  // The worklist splits NEW vs carried-over (counts above stay ALL-TIME, so ranking is unaffected — the
  // operator ruling: a watermark that reset distinct-user counts would bury slow-burning clusters).
  const liveNew = live.filter((c) => !c.reportedAt);
  const liveOld = live.filter((c) => c.reportedAt);
  const today = new Date().toISOString().slice(0, 10);
  for (const c of live) (state.utterances[c.u] ??= {}).reportedAt ??= today; // stamp AFTER the split
  state.lastRun = new Date().toISOString();
  saveState(a, state);

  const NAME = a === '2d' ? 'Geo Builder (2-D)' : 'Space Builder (3-D)';
  const row = (c, i) => `| ${i + 1} | ${c.users} | ${c.count} | \`${norm(c.u).replace(/\|/g, '\\|').slice(0, 120)}\` | ${c.bucket} | ${c.verify.detail || ''} | ${c.locales.join('/')} |`;
  const tbl = (arr, cols) => [`| # | users | subs | utterance | logged | ${cols} | loc |`, `|--:|--:|--:|---|---|---|---|`, ...arr.slice(0, top).map(row)].join('\n') + (arr.length > top ? `\n_(+${arr.length - top} more)_` : '');
  // The carried-over table earns one extra column: how long this has been sitting there unactioned.
  const rowSeen = (c, i) => `${row(c, i)}`.replace(/\|$/, `| ${c.firstSeen ?? '?'} |`);
  const tblSeen = (arr) => [`| # | users | subs | utterance | logged | now | loc | 1st seen |`, `|--:|--:|--:|---|---|---|---|---|`, ...arr.slice(0, top).map(rowSeen)].join('\n') + (arr.length > top ? `\n_(+${arr.length - top} more)_` : '');

  let s = `\n# ${NAME} — usage triage\n`;
  s += `window: ${days > 0 ? `last ${days}d` : 'all time'}${release ? ` · rel~"${release}"` : ''} · submits ${total} · sessions ${sessions} · visitors ${visitors}\n`;
  s += `buckets: ` + Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([b, n]) => `${b} ${n} (${((100 * n) / total || 0).toFixed(0)}%)`).join(' · ') + '\n';
  s += `verify: session-context replay of the App submit path (ADR-346)${noVerify ? ' — SKIPPED (--no-verify)' : ` · ${replayed} sessions replayed, ${cached} from cache @ ${headRev}${reverify ? ' (--reverify: full sweep)' : cached ? ' (--reverify for a full sweep)' : ''}`}\n`;
  s += prevRun ? `previous triage: ${prevRun.slice(0, 10)} — counts below are ALL-TIME; the worklist splits new vs carried-over\n` : `previous triage: none (first run — every row is new)\n`;
  s += `\n## ▶ LIVE grammar gaps — NEW since the last triage (the worklist)\n${liveNew.length ? tbl(liveNew, 'now') : '_none — no new gaps since the last run_'}\n`;
  if (liveOld.length) {
    // Collapsed on purpose: already put in front of the operator once. Still counted, still ranked, not re-argued.
    s += `\n## ↩ LIVE — carried over (surfaced in an earlier run, still not handled)\n`;
    s += `<details><summary>${liveOld.length} row(s) — expand</summary>\n\n${tblSeen(liveOld)}\n</details>\n`;
  }
  s += `\n## ✓ Already fixed since logged — AUTO-REMOVED (builds now, in context)\n${fixed.length ? tbl(fixed, 'builds') : '_none_'}\n`;
  s += `\n## ⇗ Would ESCALATE — parses, but an honesty gate drops a stated given (the App sends these to the LLM)\n${escalate.length ? tbl(escalate, 'gate') : '_none_'}\n`;
  s += `\n## ⊘ Guided out-of-scope — the App answers these on purpose, pre-LLM (ADR-289). NOT gaps\n${guided.length ? tbl(guided, 'scope') : '_none_'}\n`;
  s += `\n## ◇ Parses but builds nothing — context / re-declaration (M1), not a grammar gap\n${context.length ? tbl(context, 'cmds') : '_none_'}\n`;
  s += `\n## ⚠ Reasoned refusals / clarify (review)\n${review.length ? tbl(review, 'code') : '_none_'}\n`;
  s += `\n## ? UNVERIFIED — only ever seen after a step we couldn't replay (an LLM step with no logged commands — pre-#84, or 3-D per #182 — or a store action), or over budget. NOT evidence either way\n${unverified.length ? tbl(unverified, 'why') : '_none_'}\n`;
  return { md: s, live };
}

// ---- run -----------------------------------------------------------------
for (const a of APPS) fetch(a);
let out = `# log-triage — generated ${new Date().toISOString().slice(0, 10)}\n`;
out += `> **▶ LIVE is the worklist.** Every utterance is re-run through the App's real submit path — store ops →\n`;
out += `> \`parse\` WITH the session's figure as context → clarify → the pre-LLM out-of-scope register → the honesty\n`;
out += `> gates → replay (ADR-346, issue #35). So already-fixed, guided-refusal, would-escalate and\n`;
out += `> unreplayable-prefix items are separated out and are NOT gaps. Cluster the LIVE rows by intent and recommend.\n`;
for (const a of APPS) out += reportFor(a).md;
const file = path.join(reportsDir, `log-triage-${APPS.join('+')}-${new Date().toISOString().slice(0, 10)}.md`);
writeFileSync(file, out);
process.stdout.write(out + `\n\nwritten: ${path.relative(repoRoot, file)}\n`);
