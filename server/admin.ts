/**
 * Admin usage dashboard (password-protected) — `GET/POST .../admin*`.
 *
 * A self-contained Hebrew-RTL report over `events.jsonl` (written by
 * `server/eventLog.ts`): visitor / session counts, daily traffic, utterance
 * volume, parse-outcome breakdown, language split, top utterances, recent
 * activity. No DB, no external deps — the HTML (inline CSS + inline SVG bars) is
 * emitted as one string so the proxy bundle stays a single file.
 *
 * Auth mirrors the isbot dashboard's UX (username + password from env → session →
 * guard → logout) but with a STATELESS signed cookie (no store needed for one
 * admin): `geo_admin = base64(exp).hmacSHA256(secret, base64(exp))`, verified
 * (signature + expiry, timing-safe) on every request.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { eventsLogPath, type UsageEvent } from './eventLog';

const SESSION_MS = 8 * 60 * 60 * 1000; // 8 h
const COOKIE = 'geo_admin';

// Anthropic Console usage/cost page — the LLM fallback (Haiku) spend lives here.
const API_COST_URL = 'https://console.anthropic.com/settings/usage';

export interface AdminOpts {
  username: string;
  password: string;
  cookieSecret: string;
  /** Public base path the browser sees — cookie Path + redirect targets. */
  base?: string; // default '/admin'; production sets '/geo-builder/admin'
  /** Override the events file (tests). */
  logPath?: string;
}

// ── auth ────────────────────────────────────────────────────────────────────

/** Constant-time string equality (hash first → equal length, no length leak). */
function safeEq(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function makeCookie(secret: string): string {
  const exp = Buffer.from(String(Date.now() + SESSION_MS)).toString('base64url');
  return `${exp}.${sign(exp, secret)}`;
}

function validCookie(raw: string | undefined, secret: string): boolean {
  if (!raw) return false;
  const dot = raw.indexOf('.');
  if (dot < 0) return false;
  const exp = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!safeEq(sig, sign(exp, secret))) return false;
  const ms = Number(Buffer.from(exp, 'base64url').toString('utf8'));
  return Number.isFinite(ms) && ms > Date.now();
}

function readCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

// ── data ────────────────────────────────────────────────────────────────────

/** Read + parse the events JSONL (tolerant of partial/blank lines). */
export async function readEvents(file: string): Promise<UsageEvent[]> {
  let text = '';
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return []; // no file yet → empty dashboard
  }
  const out: UsageEvent[] = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s) as UsageEvent);
    } catch {
      /* skip a torn last line */
    }
  }
  return out;
}

const OUTCOME_LABELS: Record<string, string> = {
  parsed: 'נותח (דקדוק)',
  deferred: 'נדחה (אילוץ)',
  weak: 'חלקי / נשמט',
  'llm-built': 'נותח (LLM)',
  'not-understood': 'לא הובן',
  edit: 'עריכה (שינוי שם / מיזוג)',
};

/** Classify a `submit` event into an outcome bucket from its source + result. */
function outcomeOf(e: UsageEvent): string {
  const r = e.result ?? 'ok';
  if (e.source === 'llm') return r === 'ok' ? 'llm-built' : 'not-understood';
  if (e.source === 'parser') {
    if (r.startsWith('weak')) return 'weak';
    if (r === 'deferred-constraint') return 'deferred';
    return 'parsed';
  }
  return 'edit'; // swap / rename / merge
}

export interface Stats {
  total: number;
  sessions: number;
  visitors: number;
  submits: number;
  llmFallbacks: number;
  firstSeen: string | null;
  lastSeen: string | null;
  byDay: { day: string; sessions: number; submits: number }[];
  outcomes: { key: string; label: string; count: number }[];
  langs: { he: number; en: number; other: number };
  topUtterances: { utterance: string; count: number }[];
  recent: UsageEvent[];
}

function day(ts: string | undefined): string {
  return (ts ?? '').slice(0, 10);
}

/** Aggregate raw events into the dashboard's numbers. Pure + unit-tested. */
export function aggregate(events: UsageEvent[]): Stats {
  const sessionIds = new Set<string>();
  const visitorIds = new Set<string>();
  const byDay = new Map<string, { sessions: Set<string>; submits: number }>();
  const outcomeCount = new Map<string, number>();
  const uttCount = new Map<string, number>();
  const langs = { he: 0, en: 0, other: 0 };
  let submits = 0;
  let llmFallbacks = 0;
  let firstSeen: string | null = null;
  let lastSeen: string | null = null;

  for (const e of events) {
    const ts = e.serverTs ?? e.t;
    if (ts) {
      if (!firstSeen || ts < firstSeen) firstSeen = ts;
      if (!lastSeen || ts > lastSeen) lastSeen = ts;
    }
    if (e.iph) visitorIds.add(e.iph);
    if (e.sid) sessionIds.add(e.sid);
    const d = day(ts);
    const bucket = byDay.get(d) ?? { sessions: new Set<string>(), submits: 0 };
    if (e.sid) bucket.sessions.add(e.sid);

    if (e.ev === 'submit') {
      submits++;
      bucket.submits++;
      const oc = outcomeOf(e);
      outcomeCount.set(oc, (outcomeCount.get(oc) ?? 0) + 1);
      if (e.source === 'llm') llmFallbacks++;
      if (e.locale === 'he') langs.he++;
      else if (e.locale === 'en') langs.en++;
      else langs.other++;
      const u = (e.utterance ?? '').trim();
      if (u) uttCount.set(u, (uttCount.get(u) ?? 0) + 1);
    }
    byDay.set(d, bucket);
  }

  const last30 = [...byDay.entries()]
    .filter(([d]) => d)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-30)
    .map(([d, v]) => ({ day: d, sessions: v.sessions.size, submits: v.submits }));

  const outcomes = Object.keys(OUTCOME_LABELS)
    .map((key) => ({ key, label: OUTCOME_LABELS[key], count: outcomeCount.get(key) ?? 0 }))
    .filter((o) => o.count > 0);

  const topUtterances = [...uttCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([utterance, count]) => ({ utterance, count }));

  const recent = events
    .filter((e) => e.ev === 'submit')
    .slice(-100)
    .reverse();

  return {
    total: events.length,
    sessions: sessionIds.size,
    visitors: visitorIds.size,
    submits,
    llmFallbacks,
    firstSeen,
    lastSeen,
    byDay: last30,
    outcomes,
    langs,
    topUtterances,
    recent,
  };
}

/** Dashboard filter state, parsed from the query string (`?since=YYYY-MM-DD&rel=<build>`). */
export interface Filter {
  since?: string;
  rel?: string;
}

/** Keep only events matching the filter: on/after `since` (by day) and/or from a specific release `rel`. */
export function filterEvents(events: UsageEvent[], f: Filter): UsageEvent[] {
  return events.filter((e) => {
    const day = (e.serverTs ?? e.t ?? '').slice(0, 10);
    if (f.since && day && day < f.since) return false;
    if (f.rel && f.rel !== 'all' && e.rel !== f.rel) return false;
    return true;
  });
}

/** Distinct release ids in the log, most-recently-seen first (for the filter dropdown). */
export function releasesOf(events: UsageEvent[]): string[] {
  const lastSeen = new Map<string, string>();
  for (const e of events) {
    if (!e.rel) continue;
    const ts = e.serverTs ?? e.t ?? '';
    if (!lastSeen.has(e.rel) || ts > lastSeen.get(e.rel)!) lastSeen.set(e.rel, ts);
  }
  return [...lastSeen.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([r]) => r);
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const PAGE_HEAD = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Geo Builder — דוח שימוש</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;margin:0;background:#f4f6f9;color:#1f2937}
  .wrap{max-width:1000px;margin:0 auto;padding:24px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#6b7280;font-size:13px;margin-bottom:20px}
  .cards{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;flex:1 1 140px;min-width:140px}
  .card .n{font-size:26px;font-weight:700}
  .card .l{font-size:12px;color:#6b7280;margin-top:2px}
  .panel{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin-bottom:20px}
  .panel h2{font-size:15px;margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:right;padding:6px 8px;border-bottom:1px solid #f0f1f3}
  th{color:#6b7280;font-weight:600}
  .bars{display:flex;align-items:flex-end;gap:3px;height:120px}
  .bar{flex:1;background:#3b82f6;border-radius:3px 3px 0 0;min-height:2px;position:relative}
  .bar span{position:absolute;bottom:-18px;right:50%;transform:translateX(50%);font-size:9px;color:#9ca3af;white-space:nowrap}
  .obar{height:14px;border-radius:7px;background:#10b981}
  .muted{color:#9ca3af}
  .top{display:flex;justify-content:flex-start;gap:12px;align-items:center;margin-bottom:16px}
  .btn{background:#ef4444;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:13px;text-decoration:none;cursor:pointer}
  .btn2{background:#0ea5e9;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:13px;text-decoration:none;cursor:pointer}
  .login{max-width:340px;margin:80px auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:24px}
  .filters{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:13px}
  .filters label{display:flex;align-items:center;gap:6px;color:#374151}
  .filters select,.filters input{padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;direction:ltr}
  .filters button{background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer}
  .chip{background:#eef2ff;color:#3730a3;border-radius:14px;padding:4px 10px;font-size:12px;text-decoration:none}
  .login input{width:100%;padding:8px 10px;margin:6px 0 14px;border:1px solid #d1d5db;border-radius:6px;font-size:14px}
  .login button{width:100%;background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:9px;font-size:14px;cursor:pointer}
  .err{color:#b91c1c;font-size:13px;margin-bottom:8px}
  code{background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:12px;direction:ltr;display:inline-block}
</style></head><body><div class="wrap">`;
const PAGE_FOOT = `</div></body></html>`;

function loginPage(base: string, error: boolean): string {
  return (
    PAGE_HEAD +
    `<form class="login" method="post" action="${esc(base)}/login">
      <h1>כניסת מנהל</h1>
      ${error ? '<div class="err">שם משתמש או סיסמה שגויים</div>' : ''}
      <label>שם משתמש</label><input name="username" autocomplete="username" autofocus>
      <label>סיסמה</label><input name="password" type="password" autocomplete="current-password">
      <button type="submit">כניסה</button>
    </form>` +
    PAGE_FOOT
  );
}

function card(n: string | number, l: string): string {
  return `<div class="card"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`;
}

function dailyChart(byDay: Stats['byDay']): string {
  if (!byDay.length) return '<div class="muted">אין נתונים עדיין</div>';
  const max = Math.max(1, ...byDay.map((d) => d.submits));
  const bars = byDay
    .map((d) => {
      const h = Math.round((d.submits / max) * 100);
      const lbl = d.day.slice(5); // MM-DD
      return `<div class="bar" style="height:${h}%" title="${esc(d.day)}: ${d.submits}"><span>${esc(lbl)}</span></div>`;
    })
    .join('');
  return `<div class="bars">${bars}</div><div style="height:20px"></div>`;
}

function outcomeBars(outcomes: Stats['outcomes']): string {
  if (!outcomes.length) return '<div class="muted">אין נתונים עדיין</div>';
  const total = outcomes.reduce((s, o) => s + o.count, 0) || 1;
  return (
    '<table>' +
    outcomes
      .map((o) => {
        const pct = Math.round((o.count / total) * 100);
        return `<tr><td style="width:160px">${esc(o.label)}</td>
          <td><div class="obar" style="width:${Math.max(2, pct)}%"></div></td>
          <td style="width:80px" class="muted">${o.count} (${pct}%)</td></tr>`;
      })
      .join('') +
    '</table>'
  );
}

/** The release/date filter bar (a GET form back to the dashboard, so the cookie + auth survive). */
function filterBar(base: string, releases: string[], cur: Filter, presets: { label: string; since: string }[]): string {
  const relOpts = ['all', ...releases]
    .map((r) => `<option value="${esc(r)}"${(cur.rel ?? 'all') === r ? ' selected' : ''}>${r === 'all' ? 'כל הגרסאות' : esc(r)}</option>`)
    .join('');
  const keepRel = cur.rel && cur.rel !== 'all' ? `&rel=${encodeURIComponent(cur.rel)}` : '';
  const chips = presets.map((p) => `<a class="chip" href="${esc(base)}?since=${esc(p.since)}${keepRel}">${esc(p.label)}</a>`).join(' ');
  const active = !!(cur.since || (cur.rel && cur.rel !== 'all'));
  return `<form class="filters" method="get" action="${esc(base)}">
      <label>גרסה <select name="rel">${relOpts}</select></label>
      <label>מתאריך <input type="date" name="since" value="${esc(cur.since ?? '')}"></label>
      <button type="submit">סנן</button>
      ${chips}
      ${active ? `<a class="chip" href="${esc(base)}">איפוס הכל</a>` : ''}
    </form>`;
}

function dashboard(base: string, s: Stats, releases: string[], cur: Filter, presets: { label: string; since: string }[]): string {
  const fmt = (ts: string | null) => (ts ? ts.replace('T', ' ').slice(0, 16) : '—');
  const range = s.firstSeen ? `${fmt(s.firstSeen)} — ${fmt(s.lastSeen)}` : 'אין נתונים';
  const filtered = !!(cur.since || (cur.rel && cur.rel !== 'all'));
  return (
    PAGE_HEAD +
    `<div class="top">
       <h1 style="flex:1">Geo Builder — דוח שימוש</h1>
       <a class="btn2" href="${API_COST_URL}" target="_blank" rel="noopener">💰 עלות API</a>
       <a class="btn" href="${esc(base)}/logout">יציאה</a>
     </div>
     <div class="sub">טווח נתונים: ${esc(range)}${filtered ? ' · <b>מסונן</b>' : ''}</div>
     ${filterBar(base, releases, cur, presets)}
     <div class="cards">
       ${card(s.visitors, 'מבקרים ייחודיים')}
       ${card(s.sessions, 'כניסות (sessions)')}
       ${card(s.submits, 'פעולות / משפטים')}
       ${card(s.llmFallbacks, 'נפילה ל-LLM')}
     </div>
     <div class="panel"><h2>פעילות יומית (30 ימים אחרונים)</h2>${dailyChart(s.byDay)}</div>
     <div class="panel"><h2>תוצאות ניתוח</h2>${outcomeBars(s.outcomes)}</div>
     <div class="panel"><h2>שפה</h2>
       <table><tr><td>עברית</td><td class="muted">${s.langs.he}</td></tr>
       <tr><td>אנגלית</td><td class="muted">${s.langs.en}</td></tr>
       ${s.langs.other ? `<tr><td>אחר</td><td class="muted">${s.langs.other}</td></tr>` : ''}</table>
     </div>
     <div class="panel"><h2>משפטים נפוצים</h2>
       <table><tr><th>משפט</th><th style="width:60px">פעמים</th></tr>
       ${
         s.topUtterances.length
           ? s.topUtterances.map((u) => `<tr><td><code>${esc(u.utterance)}</code></td><td>${u.count}</td></tr>`).join('')
           : '<tr><td class="muted">אין נתונים עדיין</td><td></td></tr>'
       }</table>
     </div>
     <div class="panel"><h2>פעילות אחרונה</h2>
       <table><tr><th style="width:130px">זמן</th><th style="width:50px">שפה</th><th>משפט</th><th style="width:120px">תוצאה</th></tr>
       ${
         s.recent.length
           ? s.recent
               .map(
                 (e) =>
                   `<tr><td class="muted">${esc(fmt(e.serverTs ?? e.t ?? null))}</td>
                    <td>${esc(e.locale ?? '')}</td>
                    <td><code>${esc(e.utterance ?? '')}</code></td>
                    <td class="muted">${esc(OUTCOME_LABELS[outcomeOf(e)] ?? e.result ?? '')}</td></tr>`,
               )
               .join('')
           : '<tr><td class="muted">אין נתונים עדיין</td><td></td><td></td><td></td></tr>'
       }</table>
     </div>` +
    PAGE_FOOT
  );
}

// ── routing ───────────────────────────────────────────────────────────────────

function send(res: ServerResponse, code: number, html: string, headers: Record<string, string> = {}): void {
  res.statusCode = code;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(html);
}

/** Handle any `.../admin*` request: login form, login POST, logout, or dashboard. */
export async function handleAdmin(req: IncomingMessage, res: ServerResponse, opts: AdminOpts): Promise<void> {
  const base = opts.base ?? '/admin';
  const cookiePath = base; // Path attr the browser scopes the cookie to
  const path = (req.url ?? '').split('?')[0];

  // logout
  if (path.endsWith('/logout')) {
    res.statusCode = 303;
    res.setHeader('set-cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=${cookiePath}; Max-Age=0`);
    res.setHeader('location', base);
    res.end();
    return;
  }

  // login POST
  if (path.endsWith('/login') && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const params = new URLSearchParams(body);
    // A blank configured password means the dashboard is unconfigured → never authenticate
    // (otherwise a blank submission would match a blank secret).
    const configured = opts.username.length > 0 && opts.password.length > 0;
    const ok =
      configured &&
      safeEq(params.get('username') ?? '', opts.username) &&
      safeEq(params.get('password') ?? '', opts.password);
    if (!ok) return send(res, 401, loginPage(base, true));
    res.statusCode = 303;
    res.setHeader(
      'set-cookie',
      `${COOKIE}=${makeCookie(opts.cookieSecret)}; HttpOnly; Secure; SameSite=Strict; Path=${cookiePath}; Max-Age=${Math.floor(SESSION_MS / 1000)}`,
    );
    res.setHeader('location', base);
    res.end();
    return;
  }

  // dashboard (auth required)
  const authed = validCookie(readCookies(req)[COOKIE], opts.cookieSecret);
  if (!authed) return send(res, 200, loginPage(base, false));

  const all = await readEvents(opts.logPath ?? eventsLogPath());
  // Filter state from the query string (?since=YYYY-MM-DD&rel=<build>) — empty = show everything.
  const q = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
  const cur: Filter = { since: q.get('since') || undefined, rel: q.get('rel') || undefined };
  const releases = releasesOf(all);
  const events = filterEvents(all, cur);
  // "since" presets, computed from the server clock (last 24h / 7d / 30d).
  const dayMinus = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const presets = [
    { label: '24 שעות', since: dayMinus(1) },
    { label: '7 ימים', since: dayMinus(7) },
    { label: '30 ימים', since: dayMinus(30) },
  ];
  return send(res, 200, dashboard(base, aggregate(events), releases, cur, presets));
}
