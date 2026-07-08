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
import { clientIp, makeRateLimiter } from './http';

const SESSION_MS = 8 * 60 * 60 * 1000; // 8 h
const COOKIE = 'geo_admin';

// Throttle admin login attempts per client IP (SEC-6): the password compare is constant-time, but an
// unthrottled endpoint still allows online brute-force at full speed. 10 attempts/min/IP.
const loginLimited = makeRateLimiter(10, 60_000);

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
  /** Which app's dashboard to render (title + outcome classifier + labels). Default: the 2-D profile. */
  profile?: DashboardProfile;
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

/**
 * A dashboard PROFILE — everything about how one app's raw events become the
 * page's outcome buckets + labels. The 2-D app and its 3-D sibling
 * (`src3d/`, `/3d-builder/`) share ONE dashboard renderer; only the profile
 * differs. Keeping this a plain data+function bundle (not a subclass) means the
 * whole aggregation/HTML pipeline stays generic and both apps stay byte-DRY.
 */
export interface DashboardProfile {
  /** Page + header title. */
  title: string;
  /** Outcome-key → Hebrew label, in display order (the outcome-bars + recent-activity table read this). */
  outcomeLabels: Record<string, string>;
  /** Map one `submit` event to its outcome key. */
  classify(e: UsageEvent): string;
  /** The primary "real gaps to implement" bucket key (the first clickable drill card). */
  gapKey: string;
  gapCard: string;
  /** The secondary clickable bucket key + card label (2-D: out-of-scope, 3-D: reasoned refusals). */
  secondaryKey: string;
  secondaryCard: string;
  /** Drill-panel titles for the two clickable cards. */
  gapDrillTitle: string;
  secondaryDrillTitle: string;
  /** Optional sub-breakdown of a bucket (2-D scope categories / 3-D refusal codes) → its own panel. */
  subCategoryOf?(e: UsageEvent): string | null;
  subLabels?: Record<string, string>;
  subPanelTitle?: string;
}

// ── the 2-D profile (the original, unchanged behaviour) ──────────────────────

const OUTCOME_LABELS_2D: Record<string, string> = {
  parsed: 'נותח (דקדוק)',
  deferred: 'נדחה (אילוץ)',
  weak: 'חלקי / נשמט',
  'llm-built': 'נותח (LLM)',
  'not-understood': 'לא הובן — פער אמיתי (לטיפול)',
  'out-of-scope': 'מחוץ לתחום (לא נדרש)',
  throttled: 'נחסם — מגבלת עומס/תקציב (SEC-2)',
  edit: 'עריכה (שינוי שם / מיזוג)',
};

/** Hebrew labels for the out-of-scope sub-categories (the SPA's `scope:<category>` tag — see src/parser/scope.ts). */
const SCOPE_LABELS_2D: Record<string, string> = {
  analytic: 'גאומטריה אנליטית (צירים / שיפוע)',
  'angle-relation': 'יחסי זוויות / משפטים',
  proof: 'בקשת הוכחה',
  compute: 'בקשת חישוב / פתרון',
  unrelated: 'לא קשור / טקסט חופשי',
};

/** Classify a 2-D `submit` event into an outcome bucket from its source + result. */
function outcomeOf2D(e: UsageEvent): string {
  const r = e.result ?? 'ok';
  // A deliberately out-of-scope input (angle relationship, proof/compute request, free text) the SPA
  // recognised after the LLM failed — kept SEPARATE from a genuine `not-understood` gap (operator request).
  if (e.source === 'scope') return 'out-of-scope';
  // The proxy THROTTLED the submission (daily cost ceiling / per-IP limit) — the SEC-2 tag whose whole
  // point is operator visibility; the `edit` fallback used to swallow it (review 2026-07-03, V2).
  if (e.source === 'limit') return 'throttled';
  if (e.source === 'llm') return r === 'ok' ? 'llm-built' : 'not-understood';
  if (e.source === 'parser') {
    if (r.startsWith('weak')) return 'weak';
    if (r === 'deferred-constraint') return 'deferred';
    return 'parsed';
  }
  return 'edit'; // swap / rename / merge
}

/** The out-of-scope sub-category of a `scope` event (`scope:<cat>` → `<cat>`), or null. */
function scopeCategoryOf2D(e: UsageEvent): string | null {
  if (e.source !== 'scope') return null;
  const r = e.result ?? '';
  return r.startsWith('scope:') ? r.slice('scope:'.length) : 'unrelated';
}

export const PROFILE_2D: DashboardProfile = {
  title: 'Geo Builder — דוח שימוש',
  outcomeLabels: OUTCOME_LABELS_2D,
  classify: outcomeOf2D,
  gapKey: 'not-understood',
  gapCard: 'פערים אמיתיים (לטיפול)',
  secondaryKey: 'out-of-scope',
  secondaryCard: 'מחוץ לתחום (לא נדרש)',
  gapDrillTitle: 'פערים אמיתיים — משפטים שלא הובנו (לטיפול)',
  secondaryDrillTitle: 'מחוץ לתחום — משפטים שזוהו כלא-נדרשים',
  subCategoryOf: scopeCategoryOf2D,
  subLabels: SCOPE_LABELS_2D,
  subPanelTitle: 'מחוץ לתחום — לפי סוג (לא נדרש מימוש)',
};

// ── the 3-D profile (the space/vectors sibling app, `/3d-builder/`) ──────────

const OUTCOME_LABELS_3D: Record<string, string> = {
  parsed: 'נותח (דקדוק)',
  'llm-built': 'נותח (LLM)',
  refused: 'סירוב מנומק (מחוץ ליכולת / קלט לא-עקבי)',
  'not-understood': 'לא הובן — פער אמיתי (לטיפול)',
};

/**
 * Hebrew labels for the 3-D reasoned-refusal codes (an honest `err.code` the parser/engine
 * returns instead of a wrong figure — e.g. an oblique prism, a two-parameter plane, a refuted
 * claim). These are NOT gaps to implement — they are the tool correctly declining. The keys
 * are the exact `code` strings the SPA logs as the submit `result`.
 */
const REFUSAL_LABELS_3D: Record<string, string> = {
  'claim-refuted': 'טענה הופרכה (תשובת תלמיד שגויה)',
  'symbolic-new-point': 'נקודה חדשה עם נעלמים',
  'size-on-solid': 'מידה על גוף עם ממדים חופשיים',
  'free-size-claim': 'טענת גודל על ממד חופשי',
  'two-params': 'מישור עם שני פרמטרים',
  'two-unknowns': 'שני נעלמים',
  'no-roots': 'אין פתרון לפרמטר (סתירה)',
  'no-solution': 'אין פתרון',
  'no-such-solid': 'אין גוף כזה',
  'not-coplanar': 'הנקודות אינן במישור אחד',
  'not-on-line': 'הנקודה אינה על הישר',
  'not-on-plane': 'הנקודה אינה על המישור',
  'not-on-segment': 'הנקודה אינה על הקטע',
  'line-misses-plane': 'הישר אינו חותך את המישור',
  'wrong-side-of-plane': 'הנקודה בצד הלא-נכון של המישור',
  'plane-side-undefined': 'צד המישור אינו מוגדר (מישור אנכי)',
  'sign-unsatisfiable': 'סימן לא ניתן לסיפוק',
  'injection-unsatisfiable': 'הזרקת קואורדינטות בלתי-אפשרית',
  'oblique-prism': 'מנסרה נטויה',
  'bad-ratio': 'יחס לא תקין',
  'bad-solid': 'הגדרת גוף שגויה',
  'bad-name': 'שם לא תקין',
  'need-basis': 'חסר בסיס וקטורי',
  'already-defined': 'כבר מוגדר',
  'unknown-point': 'נקודה לא ידועה',
  'unknown-line': 'ישר לא ידוע',
  'unknown-plane': 'מישור לא ידוע',
  'unknown-vector': 'וקטור לא ידוע',
  'unknown-symbol': 'סמל לא ידוע',
};

/**
 * Classify a 3-D `submit` event. The 3-D SPA logs only two sources: `parser` and `llm`
 * (no scope/limit/edit lane). A parser event with a non-`ok` result is a reasoned refusal
 * code (the intermediate `not-understood` step that escalates to the LLM is already dropped
 * client-side by `analyticsSubmit3`, so it never reaches here).
 */
function outcomeOf3D(e: UsageEvent): string {
  const r = e.result ?? 'ok';
  if (e.source === 'llm') return r === 'ok' ? 'llm-built' : 'not-understood';
  // parser (or any non-llm source)
  if (r === 'ok') return 'parsed';
  if (r === 'not-understood') return 'not-understood'; // defensive: should be intermediate-dropped
  return 'refused';
}

/** The refusal-code sub-category of a 3-D refused event (the raw `result` code), or null. */
function refusalCodeOf3D(e: UsageEvent): string | null {
  return outcomeOf3D(e) === 'refused' ? (e.result ?? 'unknown') : null;
}

export const PROFILE_3D: DashboardProfile = {
  title: '3D Builder — דוח שימוש',
  outcomeLabels: OUTCOME_LABELS_3D,
  classify: outcomeOf3D,
  gapKey: 'not-understood',
  gapCard: 'פערים אמיתיים (לטיפול)',
  secondaryKey: 'refused',
  secondaryCard: 'סירובים מנומקים',
  gapDrillTitle: 'פערים אמיתיים — משפטים שלא הובנו (לטיפול)',
  secondaryDrillTitle: 'סירובים מנומקים — משפטים שהכלי דחה במכוון',
  subCategoryOf: refusalCodeOf3D,
  subLabels: REFUSAL_LABELS_3D,
  subPanelTitle: 'סירובים — לפי סוג (לא נדרש מימוש)',
};

export interface Stats {
  total: number;
  sessions: number;
  visitors: number;
  submits: number;
  llmFallbacks: number;
  /** Genuine construction gaps to IMPLEMENT (the `not-understood` bucket) — what to build next. */
  realGaps: number;
  /** Deliberately out-of-scope inputs we do NOT need to implement (the `out-of-scope` bucket). */
  outOfScope: number;
  firstSeen: string | null;
  lastSeen: string | null;
  byDay: { day: string; sessions: number; submits: number }[];
  outcomes: { key: string; label: string; count: number }[];
  /** Out-of-scope inputs broken down by sub-category (angle-relation / proof / compute / unrelated). */
  scopeBreakdown: { key: string; label: string; count: number }[];
  /** Drill-down lists (the actual utterances) behind the real-gap and out-of-scope cards — grouped + counted. */
  gapUtterances: DrillRow[];
  scopeUtterances: DrillRow[];
  langs: { he: number; en: number; other: number };
  topUtterances: { utterance: string; count: number }[];
  recent: UsageEvent[];
}

/** One row of a card's drill-down list: a distinct utterance with how often it appeared. */
export interface DrillRow {
  utterance: string;
  count: number;
  locale: string;
  lastSeen: string;
}

function day(ts: string | undefined): string {
  return (ts ?? '').slice(0, 10);
}

/** Aggregate raw events into the dashboard's numbers. Pure + unit-tested. `profile` defaults to 2-D. */
export function aggregate(events: UsageEvent[], profile: DashboardProfile = PROFILE_2D): Stats {
  const sessionIds = new Set<string>();
  const visitorIds = new Set<string>();
  const byDay = new Map<string, { sessions: Set<string>; submits: number }>();
  const outcomeCount = new Map<string, number>();
  const scopeCount = new Map<string, number>();
  const uttCount = new Map<string, number>();
  // Per-utterance drill maps behind the real-gap / out-of-scope cards.
  const gapMap = new Map<string, { count: number; locale: string; lastSeen: string }>();
  const scopeUttMap = new Map<string, { count: number; locale: string; lastSeen: string }>();
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
      const oc = profile.classify(e);
      outcomeCount.set(oc, (outcomeCount.get(oc) ?? 0) + 1);
      const sc = profile.subCategoryOf?.(e) ?? null;
      if (sc) scopeCount.set(sc, (scopeCount.get(sc) ?? 0) + 1);
      if (e.source === 'llm') llmFallbacks++;
      if (e.locale === 'he') langs.he++;
      else if (e.locale === 'en') langs.en++;
      else langs.other++;
      const u = (e.utterance ?? '').trim();
      if (u) uttCount.set(u, (uttCount.get(u) ?? 0) + 1);
      // Accumulate the per-utterance drill list for whichever card this falls under.
      const drill = oc === profile.gapKey ? gapMap : oc === profile.secondaryKey ? scopeUttMap : null;
      if (drill && u) {
        const ts2 = e.serverTs ?? e.t ?? '';
        const g = drill.get(u) ?? { count: 0, locale: e.locale ?? '', lastSeen: '' };
        g.count++;
        if (ts2 >= g.lastSeen) {
          g.lastSeen = ts2;
          g.locale = e.locale ?? g.locale;
        }
        drill.set(u, g);
      }
    }
    byDay.set(d, bucket);
  }

  const last30 = [...byDay.entries()]
    .filter(([d]) => d)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-30)
    .map(([d, v]) => ({ day: d, sessions: v.sessions.size, submits: v.submits }));

  const outcomes = Object.keys(profile.outcomeLabels)
    .map((key) => ({ key, label: profile.outcomeLabels[key], count: outcomeCount.get(key) ?? 0 }))
    .filter((o) => o.count > 0);

  const subLabels = profile.subLabels ?? {};
  // A refusal/scope sub-category with no authored label still shows (keyed by its raw code) so a new
  // refusal type can never be silently invisible.
  const scopeBreakdown = [...new Set([...Object.keys(subLabels), ...scopeCount.keys()])]
    .map((key) => ({ key, label: subLabels[key] ?? key, count: scopeCount.get(key) ?? 0 }))
    .filter((o) => o.count > 0)
    .sort((a, b) => b.count - a.count);

  // Drill lists: distinct utterances, most-frequent first then most-recent, capped so the page stays lean.
  const toDrill = (m: Map<string, { count: number; locale: string; lastSeen: string }>): DrillRow[] =>
    [...m.entries()]
      .map(([utterance, v]) => ({ utterance, count: v.count, locale: v.locale, lastSeen: v.lastSeen }))
      .sort((a, b) => b.count - a.count || (a.lastSeen < b.lastSeen ? 1 : -1))
      .slice(0, 200);
  const gapUtterances = toDrill(gapMap);
  const scopeUtterances = toDrill(scopeUttMap);

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
    realGaps: outcomeCount.get(profile.gapKey) ?? 0,
    outOfScope: outcomeCount.get(profile.secondaryKey) ?? 0,
    firstSeen,
    lastSeen,
    byDay: last30,
    outcomes,
    scopeBreakdown,
    gapUtterances,
    scopeUtterances,
    langs,
    topUtterances,
    recent,
  };
}

/** Dashboard filter state, parsed from the query string (`?since=YYYY-MM-DD&rel=<build>&view=gaps`). */
export interface Filter {
  since?: string;
  rel?: string;
  /** Which card's drill-down list is open (`gaps` / `scope`), if any. Not a data filter — a view toggle. */
  view?: string;
}

/** Build a dashboard query string from the filter (+ overrides), dropping empties. `view:undefined` closes a drill. */
function queryString(cur: Filter, extra: Partial<Filter> = {}): string {
  const f = { ...cur, ...extra };
  const parts: string[] = [];
  if (f.since) parts.push(`since=${encodeURIComponent(f.since)}`);
  if (f.rel && f.rel !== 'all') parts.push(`rel=${encodeURIComponent(f.rel)}`);
  if (f.view) parts.push(`view=${encodeURIComponent(f.view)}`);
  return parts.length ? `?${parts.join('&')}` : '';
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

const pageHead = (title = 'Geo Builder — דוח שימוש') => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
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
  a.cardlink{text-decoration:none;color:inherit;cursor:pointer;transition:border-color .12s,box-shadow .12s}
  a.cardlink:hover{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.15)}
  a.cardlink.active{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.25)}
  a.cardlink .l::after{content:' ›';color:#3b82f6}
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

function loginPage(base: string, error: boolean, title?: string): string {
  return (
    pageHead(title) +
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

/** A CLICKABLE card that toggles a drill-down view (e.g. the real-gap list). `active` when its view is open. */
function cardLink(n: string | number, l: string, href: string, active: boolean): string {
  return `<a class="card cardlink${active ? ' active' : ''}" href="${esc(href)}"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></a>`;
}

/** The drill-down list behind a clickable card: distinct utterances + counts, newest column, with a close link. */
function drillPanel(title: string, rows: DrillRow[], closeHref: string, fmt: (ts: string | null) => string): string {
  const head = `<div class="top" style="margin-bottom:8px"><h2 style="flex:1;margin:0">${esc(title)}</h2><a class="chip" href="${esc(closeHref)}">סגירה ✕</a></div>`;
  if (!rows.length) return `<div class="panel">${head}<div class="muted">אין פריטים בטווח/הסינון הנוכחי 🎉</div></div>`;
  const trs = rows
    .map(
      (r) =>
        `<tr><td><code>${esc(r.utterance)}</code></td><td>${r.count}</td>
         <td class="muted">${esc(r.locale)}</td><td class="muted">${esc(fmt(r.lastSeen || null))}</td></tr>`,
    )
    .join('');
  return `<div class="panel">${head}
    <table><tr><th>משפט</th><th style="width:60px">פעמים</th><th style="width:50px">שפה</th><th style="width:130px">נראה לאחרונה</th></tr>
    ${trs}</table></div>`;
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
  // Preset chips and the form keep the open drill view, so changing the date/release re-filters the
  // drill list in place (the operator's "the drill should take the filter into account").
  const chips = presets.map((p) => `<a class="chip" href="${esc(base)}${esc(queryString(cur, { since: p.since }))}">${esc(p.label)}</a>`).join(' ');
  const active = !!(cur.since || (cur.rel && cur.rel !== 'all'));
  const keepView = cur.view ? `<input type="hidden" name="view" value="${esc(cur.view)}">` : '';
  return `<form class="filters" method="get" action="${esc(base)}">
      <label>גרסה <select name="rel">${relOpts}</select></label>
      <label>מתאריך <input type="date" name="since" value="${esc(cur.since ?? '')}"></label>
      ${keepView}
      <button type="submit">סנן</button>
      ${chips}
      ${active ? `<a class="chip" href="${esc(base)}${esc(queryString({ view: cur.view }))}">איפוס הכל</a>` : ''}
    </form>`;
}

function dashboard(
  base: string,
  s: Stats,
  releases: string[],
  cur: Filter,
  presets: { label: string; since: string }[],
  profile: DashboardProfile,
): string {
  const fmt = (ts: string | null) => (ts ? ts.replace('T', ' ').slice(0, 16) : '—');
  const range = s.firstSeen ? `${fmt(s.firstSeen)} — ${fmt(s.lastSeen)}` : 'אין נתונים';
  const filtered = !!(cur.since || (cur.rel && cur.rel !== 'all'));
  return (
    pageHead(profile.title) +
    `<div class="top">
       <h1 style="flex:1">${esc(profile.title)}</h1>
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
       ${cardLink(s.realGaps, profile.gapCard, `${esc(base)}${queryString(cur, { view: cur.view === 'gaps' ? undefined : 'gaps' })}`, cur.view === 'gaps')}
       ${cardLink(s.outOfScope, profile.secondaryCard, `${esc(base)}${queryString(cur, { view: cur.view === 'scope' ? undefined : 'scope' })}`, cur.view === 'scope')}
     </div>
     ${
       cur.view === 'gaps'
         ? drillPanel(profile.gapDrillTitle, s.gapUtterances, `${esc(base)}${queryString(cur, { view: undefined })}`, fmt)
         : cur.view === 'scope'
           ? drillPanel(profile.secondaryDrillTitle, s.scopeUtterances, `${esc(base)}${queryString(cur, { view: undefined })}`, fmt)
           : ''
     }
     <div class="panel"><h2>פעילות יומית (30 ימים אחרונים)</h2>${dailyChart(s.byDay)}</div>
     <div class="panel"><h2>תוצאות ניתוח</h2>${outcomeBars(s.outcomes)}</div>
     ${
       s.scopeBreakdown.length
         ? `<div class="panel"><h2>${esc(profile.subPanelTitle ?? '')}</h2>${outcomeBars(s.scopeBreakdown)}</div>`
         : ''
     }
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
                    <td class="muted">${esc(profile.outcomeLabels[profile.classify(e)] ?? e.result ?? '')}</td></tr>`,
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

  // Fail-closed (SEC-3): the dashboard authenticates ONLY when a username, password, AND a dedicated
  // cookie secret are ALL configured. A missing/empty cookie secret (or unconfigured password) means
  // admin is DISABLED — neither login NOR a (possibly forged) cookie may authenticate. `standalone.ts`
  // never derives this secret from `ipSalt`/the committed default, so an empty `cookieSecret` genuinely
  // means "not configured" — a forged cookie under a guessed default can no longer reach the dashboard.
  const secure = opts.username.length > 0 && opts.password.length > 0 && opts.cookieSecret.length > 0;
  const profile = opts.profile ?? PROFILE_2D; // which app's dashboard (title threads into the login page too)

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
    if (loginLimited(clientIp(req))) return send(res, 429, loginPage(base, true, profile.title)); // brute-force throttle (SEC-6)
    let body = '';
    for await (const chunk of req) body += chunk;
    const params = new URLSearchParams(body);
    // Only authenticate when securely configured (username + password + cookie secret); else 401, so an
    // unconfigured dashboard never issues a session (SEC-3).
    const ok =
      secure &&
      safeEq(params.get('username') ?? '', opts.username) &&
      safeEq(params.get('password') ?? '', opts.password);
    if (!ok) return send(res, 401, loginPage(base, true, profile.title));
    res.statusCode = 303;
    res.setHeader(
      'set-cookie',
      `${COOKIE}=${makeCookie(opts.cookieSecret)}; HttpOnly; Secure; SameSite=Strict; Path=${cookiePath}; Max-Age=${Math.floor(SESSION_MS / 1000)}`,
    );
    res.setHeader('location', base);
    res.end();
    return;
  }

  // dashboard (auth required). `secure &&` fails closed: with no configured cookie secret, even a
  // well-formed cookie is rejected — a forged cookie under a guessed/default secret can't get in (SEC-3).
  const authed = secure && validCookie(readCookies(req)[COOKIE], opts.cookieSecret);
  if (!authed) return send(res, 200, loginPage(base, false, profile.title));

  const all = await readEvents(opts.logPath ?? eventsLogPath());
  // Filter state from the query string (?since=YYYY-MM-DD&rel=<build>&view=gaps|scope) — empty = show everything.
  const q = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
  const view = q.get('view');
  const cur: Filter = {
    since: q.get('since') || undefined,
    rel: q.get('rel') || undefined,
    view: view === 'gaps' || view === 'scope' ? view : undefined, // ignore unknown view values
  };
  const releases = releasesOf(all);
  const events = filterEvents(all, cur);
  // "since" presets, computed from the server clock (last 24h / 7d / 30d).
  const dayMinus = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const presets = [
    { label: '24 שעות', since: dayMinus(1) },
    { label: '7 ימים', since: dayMinus(7) },
    { label: '30 ימים', since: dayMinus(30) },
  ];
  return send(res, 200, dashboard(base, aggregate(events, profile), releases, cur, presets, profile));
}
