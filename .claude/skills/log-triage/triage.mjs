#!/usr/bin/env node
/**
 * log-triage — one pipeline: fetch the PROD usage log(s), bucket every real user
 * utterance by outcome, then RE-RUN each candidate against the CURRENT code (parse +
 * a fresh single-utterance build) so items we've already fixed drop off the list
 * automatically. Same report shape for both apps (2-D Geo Builder + 3-D Space Builder).
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
 * Options: --server root@themathbible.com  --remote-dir /var/www/geo-proxy
 *          --days N (0=all)  --release <substr>  --top 80  --no-fetch  --no-verify
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from '../../../src/parser/parse.ts';
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
    if (e.ev !== 'submit') continue;
    if (e.sid) sessions.add(e.sid);
    if (e.iph) visitors.add(e.iph);
    events.push(e);
  }
  return { events, sessions: sessions.size, visitors: visitors.size };
}

// ---- verify: re-run one utterance through the CURRENT code ----------------
function build2d(u) {
  const r = parse(u);
  if (!r.ok) return { now: 'not-handled', detail: r.reason };
  const facts = r.commands.map((cmd, i) => ({ id: `f${i}`, group: 'g', cmd, enabled: true }));
  try {
    const d = replay(facts, 0);
    const bad = Object.entries(d.status).find(([, v]) => v !== 'ok' && v !== 'disabled');
    if (bad) return { now: 'refused', detail: String(typeof bad[1] === 'string' ? bad[1] : bad[1]?.code ?? 'err') };
    if (d.positions.size === 0) return { now: 'built-nothing', detail: r.commands.map((c) => c.type).join(',') };
    return { now: 'built', detail: r.commands.map((c) => c.type).join(',') };
  } catch (e) { return { now: 'error', detail: String(e.message || e).slice(0, 70) }; }
}
function build3d(u) {
  const r = parse3(u);
  if (!r.ok) return { now: 'not-handled', detail: r.reason };
  const fact = { id: 'f0', utterance: u, cmds: r.commands, enabled: true };
  try {
    const d = derive3([fact], 0);
    const st = d.status['f0'];
    if (st && st !== 'ok' && st !== 'disabled') return { now: 'refused', detail: typeof st === 'string' ? st : st.code ?? JSON.stringify(st) };
    if (d.positions.size === 0) return { now: 'built-nothing', detail: r.commands.map((c) => c.type).join(',') };
    return { now: 'built', detail: r.commands.map((c) => c.type).join(',') };
  } catch (e) { return { now: 'error', detail: String(e.message || e).slice(0, 70) }; }
}
const verify = (a, u) => { try { return a === '2d' ? build2d(u) : build3d(u); } catch (e) { return { now: 'error', detail: String(e).slice(0, 70) }; } };

// ---- per-app report ------------------------------------------------------
function reportFor(a) {
  const { events, sessions, visitors } = load(a);
  const byBucket = {};
  for (const e of events) (byBucket[classify(a, e)] ??= []).push(e);
  const total = events.length;
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
  for (const c of cands) c.verify = noVerify ? { now: '?', detail: '' } : verify(a, c.u);

  // sort each candidate into a REPORT bucket by its CURRENT (post-fix) outcome
  const live = [], fixed = [], context = [], review = [];
  for (const c of cands) {
    const now = c.verify.now;
    if (c.u === '(empty)') continue;
    if (now === 'not-handled') live.push(c); // still a real grammar gap
    else if (now === 'built') fixed.push(c); // already fixed since the user hit it
    else if (now === 'built-nothing') context.push(c); // parses but adds nothing standalone (M1/context)
    else review.push(c); // refused/error — a reasoned code or needs prior context
  }
  const byUsers = (x, y) => y.users - x.users || y.count - x.count;
  live.sort(byUsers); fixed.sort(byUsers); context.sort(byUsers); review.sort(byUsers);

  const NAME = a === '2d' ? 'Geo Builder (2-D)' : 'Space Builder (3-D)';
  const row = (c, i) => `| ${i + 1} | ${c.users} | ${c.count} | \`${norm(c.u).replace(/\|/g, '\\|').slice(0, 120)}\` | ${c.bucket} | ${c.verify.detail || ''} | ${c.locales.join('/')} |`;
  const tbl = (arr, cols) => [`| # | users | subs | utterance | logged | ${cols} | loc |`, `|--:|--:|--:|---|---|---|---|`, ...arr.slice(0, top).map(row)].join('\n') + (arr.length > top ? `\n_(+${arr.length - top} more)_` : '');

  let s = `\n# ${NAME} — usage triage\n`;
  s += `window: ${days > 0 ? `last ${days}d` : 'all time'}${release ? ` · rel~"${release}"` : ''} · submits ${total} · sessions ${sessions} · visitors ${visitors}\n`;
  s += `buckets: ` + Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([b, n]) => `${b} ${n} (${((100 * n) / total || 0).toFixed(0)}%)`).join(' · ') + '\n';
  s += `\n## ▶ LIVE grammar gaps — still not-handled on HEAD (the worklist)\n${live.length ? tbl(live, 'now') : '_none_'}\n`;
  s += `\n## ✓ Already fixed since logged — AUTO-REMOVED (builds now)\n${fixed.length ? tbl(fixed, 'builds') : '_none_'}\n`;
  s += `\n## ◇ Parses but builds nothing standalone — context / re-declaration (M1), not a grammar gap\n${context.length ? tbl(context, 'cmds') : '_none_'}\n`;
  s += `\n## ⚠ Reasoned refusals / needs prior context (review)\n${review.length ? tbl(review, 'code') : '_none_'}\n`;
  return { md: s, live };
}

// ---- run -----------------------------------------------------------------
for (const a of APPS) fetch(a);
let out = `# log-triage — generated ${new Date().toISOString().slice(0, 10)}\n> LIVE grammar gaps are the worklist. Already-fixed items are auto-removed (re-verified against HEAD). Cluster the LIVE gaps by intent and recommend.\n`;
for (const a of APPS) out += reportFor(a).md;
const file = path.join(reportsDir, `log-triage-${APPS.join('+')}-${new Date().toISOString().slice(0, 10)}.md`);
writeFileSync(file, out);
process.stdout.write(out + `\n\nwritten: ${path.relative(repoRoot, file)}\n`);
