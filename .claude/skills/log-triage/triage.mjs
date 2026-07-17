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
 * with no logged commands (pre-2026-07-14 events; all of 3-D until #182) or a store `action` (edit/delete/
 * show-another) — the rest of the session is marked DEGRADED: our figure is missing objects the student had,
 * so a downstream failure may be OUR artifact. Degraded failures are reported separately and NEVER claimed as
 * gaps — that is the same false-signal class this file exists to kill. An utterance is judged by its BEST
 * outcome over all its occurrences: if it builds in any real context, it is not a gap.
 *
 * Options: --server root@themathbible.com  --remote-dir /var/www/geo-proxy
 *          --days N (0=all)  --release <substr>  --top 80  --no-fetch  --no-verify
 *          --session-budget-ms N (default 60000; overrun → honest `unverified`, never a silent drop)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  parse, parseRename, parseMerge, parseSwap, parseNameCenter, buildParseCtx, classifyOutOfScope,
  droppedNewLabels, droppedGivenNumbers, droppedGivenRelations, droppedGivenVerbs, droppedCompoundRelation,
} from '../../../src/parser/index.ts';
import { replay } from '../../../src/store/geoStore.ts';
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

/** The canonical commands the LLM actually committed, logged since issue #84 (a JSON string). Lets the
 *  replay follow a step our grammar can't reproduce, keeping the PREFIX faithful — the difference between
 *  "the rest of this session is unverifiable" and real evidence. Absent on pre-2026-07-14 events, and on
 *  3-D entirely (#84 was 2-D only; #182), which is exactly when `degraded` still fires. */
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
  const t0 = Date.now();
  for (const e of evs) {
    // A store action (edit / delete / show-another, #84) reshapes the figure in ways this replay does not
    // reproduce — from here on our prefix is a guess. Honest `degraded`, not a silent divergence.
    if (e.ev === 'action') { degraded = true; out.push({ now: 'skip', detail: `action:${e.action}`, degraded }); continue; }
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
        const r = parse(u, pctx);
        if (!r.ok && (r.reason === 'ambiguous-angle' || r.reason === 'ambiguous-circle')) {
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
            else { res = { now: 'built', detail: r.commands.map((c) => c.type).join(',') }; facts = next; fig = d; } // advance only on success (keep-prior)
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
      else { facts = next; fig = d; }
    } catch { degraded = true; }
  }
  return out;
}

/** One 3-D session. `parse3` is context-free BY DESIGN (it takes no ParseContext — App3 mirrors that), so
 *  only the BUILD needs the session prefix: the `unknown-point` refusals are prefix artifacts, not gaps. */
function session3d(evs) {
  const out = [];
  let facts = [];
  let degraded = false;
  const t0 = Date.now();
  for (const e of evs) {
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
        else { res = { now: 'built', detail: r.commands.map((c) => c.type).join(',') }; facts = next; }
      }
    } catch (err) { res = { now: 'error', detail: String(err?.message ?? err).slice(0, 70) }; }
    out.push({ ...res, degraded });
    if (res.now !== 'built' && res.now !== 'skip') degraded = true;
  }
  return out;
}

/** Replay every session of an app; return normalized-utterance → the outcomes it got across sessions. */
function verifyAll(a, events) {
  const bySid = new Map();
  for (const e of events) {
    const sid = e.sid ?? '(nosid)';
    if (!bySid.has(sid)) bySid.set(sid, []);
    bySid.get(sid).push(e);
  }
  const byUtterance = new Map();
  let n = 0;
  for (const [, evs] of bySid) {
    const outs = (a === '2d' ? session2d : session3d)(evs);
    outs.forEach((o, i) => {
      if (evs[i].ev !== 'submit') return; // `action` rows exist only to degrade the prefix, never to be judged
      const key = norm(evs[i].utterance) || '(empty)';
      if (!byUtterance.has(key)) byUtterance.set(key, []);
      byUtterance.get(key).push(o);
    });
    if (++n % 10 === 0) process.stderr.write(`  verified ${n}/${bySid.size} ${a} sessions\n`);
  }
  return byUtterance;
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
      const rec = map.get(key) ?? { count: 0, iphs: new Set(), codes: new Set(), locales: new Set() };
      rec.count++; if (e.iph) rec.iphs.add(e.iph);
      if (e.result && e.result !== 'ok') rec.codes.add(e.result); if (e.locale) rec.locales.add(e.locale);
      map.set(key, rec);
    }
    for (const [u, r] of map) cands.push({ u, bucket, count: r.count, users: r.iphs.size, codes: [...r.codes], locales: [...r.locales] });
  }
  // Verify by replaying every session in order (the App's submit path, in context), then judge each
  // distinct utterance by its BEST outcome across occurrences (ADR-346).
  const verified = noVerify ? new Map() : verifyAll(a, events);
  for (const c of cands) c.verify = noVerify ? { now: '?', detail: '' } : bestOutcome(verified.get(c.u));

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

  const NAME = a === '2d' ? 'Geo Builder (2-D)' : 'Space Builder (3-D)';
  const row = (c, i) => `| ${i + 1} | ${c.users} | ${c.count} | \`${norm(c.u).replace(/\|/g, '\\|').slice(0, 120)}\` | ${c.bucket} | ${c.verify.detail || ''} | ${c.locales.join('/')} |`;
  const tbl = (arr, cols) => [`| # | users | subs | utterance | logged | ${cols} | loc |`, `|--:|--:|--:|---|---|---|---|`, ...arr.slice(0, top).map(row)].join('\n') + (arr.length > top ? `\n_(+${arr.length - top} more)_` : '');

  let s = `\n# ${NAME} — usage triage\n`;
  s += `window: ${days > 0 ? `last ${days}d` : 'all time'}${release ? ` · rel~"${release}"` : ''} · submits ${total} · sessions ${sessions} · visitors ${visitors}\n`;
  s += `buckets: ` + Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([b, n]) => `${b} ${n} (${((100 * n) / total || 0).toFixed(0)}%)`).join(' · ') + '\n';
  s += `verify: session-context replay of the App submit path (ADR-346)${noVerify ? ' — SKIPPED (--no-verify)' : ''}\n`;
  s += `\n## ▶ LIVE grammar gaps — still not-handled in a REAL session context (the worklist)\n${live.length ? tbl(live, 'now') : '_none_'}\n`;
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
