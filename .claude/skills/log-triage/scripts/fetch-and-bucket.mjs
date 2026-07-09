#!/usr/bin/env node
/**
 * log-triage — fetch the PROD usage log(s) and produce a compact, deduped digest of
 * what real users typed, bucketed by outcome. The DETERMINISTIC half of the skill:
 * it does the parsing / classification / dedup / counting so the model only has to
 * reason over the distilled gap set (not the whole log).
 *
 * Prod events live on the server (ADR-3D-016): /var/www/geo-proxy/events.jsonl (2-D)
 * and events-3d.jsonl (3-D). Each `submit` line is
 *   { serverTs, iph(hashed IP), ev, sid, rel, utterance, locale, source, result }
 * source ∈ parser|llm|scope|limit ; result = ok | a refusal code | not-understood.
 *
 * Classification MIRRORS server/admin.ts (outcomeOf2D / outcomeOf3D) — keep in sync.
 *
 * Usage:
 *   node fetch-and-bucket.mjs --app 3d            # fetch + digest the 3-D log
 *   node fetch-and-bucket.mjs --app 2d --days 30  # 2-D, last 30 days only
 *   node fetch-and-bucket.mjs --app both          # both apps
 *   node fetch-and-bucket.mjs --app 3d --no-fetch # reuse the local cache (no SSH)
 * Options: --server root@themathbible.com  --remote-dir /var/www/geo-proxy
 *          --top 60 (rows per section)     --release <substr> (filter by build rel)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const has = (k) => argv.includes(k);
const app = opt('--app', 'both'); // 2d | 3d | both
const days = Number(opt('--days', '0')) || 0; // 0 = all time
const server = opt('--server', 'root@themathbible.com');
const remoteDir = opt('--remote-dir', '/var/www/geo-proxy');
const top = Number(opt('--top', '60'));
const release = opt('--release', ''); // substring match on `rel`
const noFetch = has('--no-fetch');

const repoRoot = path.resolve(process.cwd());
const cacheDir = path.join(repoRoot, 'logs'); // gitignored
mkdirSync(cacheDir, { recursive: true });

const APPS = app === 'both' ? ['2d', '3d'] : [app];
const REMOTE = { '2d': 'events.jsonl', '3d': 'events-3d.jsonl' };
const LOCAL = { '2d': path.join(cacheDir, 'prod-events-2d.jsonl'), '3d': path.join(cacheDir, 'prod-events-3d.jsonl') };

// ---- classification (mirror of server/admin.ts) --------------------------
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
const classify = (appId, e) => (appId === '2d' ? outcome2D(e) : outcome3D(e));

// the buckets worth a human/model look, in priority order
const INTERESTING = ['not-understood', 'llm-built', 'refused', 'out-of-scope'];

// ---- fetch ---------------------------------------------------------------
function fetch(appId) {
  const local = LOCAL[appId];
  if (noFetch) {
    if (!existsSync(local)) throw new Error(`--no-fetch but no cache at ${local}`);
    return;
  }
  const src = `${server}:${remoteDir}/${REMOTE[appId]}`;
  process.stderr.write(`fetching ${src} → ${path.relative(repoRoot, local)}\n`);
  execFileSync('scp', ['-q', src, local], { stdio: ['ignore', 'ignore', 'inherit'] });
}

// ---- parse ---------------------------------------------------------------
const normUtterance = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

function load(appId) {
  const lines = readFileSync(LOCAL[appId], 'utf8').split('\n').filter(Boolean);
  const cutoff = days > 0 ? Date.now() - days * 86400_000 : 0;
  const events = [];
  let sessions = new Set();
  let visitors = new Set();
  for (const ln of lines) {
    let e;
    try { e = JSON.parse(ln); } catch { continue; }
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

// ---- aggregate -----------------------------------------------------------
function digest(appId) {
  const { events, sessions, visitors } = load(appId);
  const byBucket = {};
  for (const e of events) {
    const b = classify(appId, e);
    (byBucket[b] ??= []).push(e);
  }
  const total = events.length;
  const bucketCounts = Object.fromEntries(Object.entries(byBucket).map(([b, arr]) => [b, arr.length]));

  let out = '';
  out += `\n## ${appId.toUpperCase()} — prod usage triage digest\n`;
  out += `window: ${days > 0 ? `last ${days} days` : 'all time'}${release ? ` · release~"${release}"` : ''}\n`;
  out += `submits: ${total} · sessions: ${sessions} · distinct visitors (hashed IP): ${visitors}\n\n`;
  out += `outcome buckets: ` + Object.entries(bucketCounts).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b}=${n} (${((100 * n) / total || 0).toFixed(0)}%)`).join(' · ') + '\n';

  for (const bucket of INTERESTING) {
    const arr = byBucket[bucket] ?? [];
    if (arr.length === 0) continue;
    // dedup by normalized utterance → {count, sessions, visitors, codes}
    const map = new Map();
    for (const e of arr) {
      const key = normUtterance(e.utterance) || '(empty)';
      const rec = map.get(key) ?? { count: 0, sids: new Set(), iphs: new Set(), codes: new Set(), locales: new Set() };
      rec.count++;
      if (e.sid) rec.sids.add(e.sid);
      if (e.iph) rec.iphs.add(e.iph);
      if (e.result && e.result !== 'ok') rec.codes.add(e.result);
      if (e.locale) rec.locales.add(e.locale);
      map.set(key, rec);
    }
    const rows = [...map.entries()]
      .map(([u, r]) => ({ u, count: r.count, users: r.iphs.size, sids: r.sids.size, codes: [...r.codes], locales: [...r.locales] }))
      .sort((a, b) => b.users - a.users || b.count - a.count);
    const shown = rows.slice(0, top);
    const tail = rows.length - shown.length;
    out += `\n### ${bucket} — ${arr.length} submits, ${rows.length} distinct utterances\n`;
    out += `| # | distinct users | submits | utterance | codes | loc |\n|--:|--:|--:|---|---|---|\n`;
    shown.forEach((r, i) => {
      const u = r.u.replace(/\|/g, '\\|').slice(0, 120);
      out += `| ${i + 1} | ${r.users} | ${r.count} | \`${u}\` | ${r.codes.join(',')} | ${r.locales.join('/')} |\n`;
    });
    if (tail > 0) out += `| … | | | _(+${tail} more distinct utterances, longer tail)_ | | |\n`;
  }
  return out;
}

// ---- run -----------------------------------------------------------------
for (const a of APPS) fetch(a);
let report = `# log-triage digest (generated ${new Date().toISOString().slice(0, 10)})\n`;
for (const a of APPS) report += digest(a);
process.stdout.write(report + '\n');
