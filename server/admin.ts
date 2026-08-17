/**
 * Admin usage dashboard (password-protected) — `GET/POST .../admin*`.
 *
 * A self-contained Hebrew-RTL report over `events.jsonl` (written by
 * `server/eventLog.ts`): visitor / session counts, daily traffic, utterance
 * volume, parse-outcome breakdown, language split, top utterances, recent
 * activity, and the per-SESSION timelines (#470 — what one visit actually typed,
 * in order). No DB, no external deps — the HTML (inline CSS + inline SVG bars) is
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
import { dirname, join } from 'node:path';
import { eventsLogPath, type UsageEvent } from './eventLog';
import { clientIp, makeRateLimiter } from './http';
import { readToolConfig, validateToolConfig, writeToolConfig, type ConfigRefusal, type ToolConfig } from './adminConfig';
import productRegistry from '../products.json';

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
  /** Override the triage verdict-map file (#183; tests). Default: `<events dir>/<profile.verdictsFile>`. */
  verdictsPath?: string;
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
 * The distilled triage VERDICT MAP (#183) — what the CURRENT code does with each utterance the prod log
 * recorded as a gap, uploaded by the log-triage harness (`triage.mjs`) next to the events file. The gap
 * card renders from prod-TIME outcomes, which never expire: an utterance that failed once and was fixed
 * the next day sat in «פערים אמיתיים (לטיפול)» forever (~4/5 of the card was noise, ranked freshest-fix
 * first). Re-verifying server-side is a non-starter (the engine doesn't run on the prod box; a sweep is
 * ~10 min), so the dashboard CONSUMES the verdicts the triage run already computed — and states their
 * age, so "no verdict data" reads as UNKNOWN, never as verification that didn't happen.
 */
export interface VerdictMap {
  rev: string;
  generatedAt: string;
  /** normalized utterance → its current outcome (`built` / `not-handled` / `guided` / `would-escalate` / …). */
  verdicts: Record<string, string>;
}

export async function readVerdicts(file: string): Promise<VerdictMap | null> {
  try {
    const v = JSON.parse(await readFile(file, 'utf8')) as VerdictMap;
    return v && typeof v === 'object' && v.verdicts && typeof v.verdicts === 'object' ? v : null;
  } catch {
    return null; // absent / torn → the dashboard says so instead of implying verification
  }
}

/** A drill row's current verdict — triage normalizes whitespace, the event log only trims. */
export const verdictOf = (vm: VerdictMap | null, utterance: string): string | null =>
  vm?.verdicts[utterance.replace(/\s+/g, ' ').trim()] ?? null;

/** Verdicts that mean "this input WORKS on the current code" — moved out of the gap list. */
export const VERDICT_FIXED = new Set(['built', 'store-op']);

/** Hebrew labels for the verdict states (raw code shown for an unlisted future state — never invisible). */
const VERDICT_LABELS: Record<string, string> = {
  built: '✓ נבנה כיום',
  'store-op': '✓ פעולת עריכה — נתמך',
  guided: 'מנותב להנחיה (לא פער)',
  'would-escalate': 'מנותח חלקית — מוסלם',
  'built-nothing': 'מנותח — לא מוסיף (תלוי הקשר)',
  clarify: 'שאלת הבהרה',
  'not-handled': '✗ עדיין פער',
  refused: 'סירוב מנומק',
  error: 'שגיאה',
  unverified: '? לא ניתן לאימות',
};

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
  /** The tool id this dashboard serves (registry id; keys the per-tool config file — A3, #662). */
  tool: string;
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
  /** The triage verdict-map filename beside the events file (#183) — `verdicts-2d.json` / `verdicts-3d.json`. */
  verdictsFile?: string;
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
  tool: '2d',
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
  verdictsFile: 'verdicts-2d.json',
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
  tool: '3d',
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
  verdictsFile: 'verdicts-3d.json',
};

/**
 * One step of a session timeline (#470) — a `submit` or a store `action`, in LOG order.
 *
 * The dashboard's every other utterance surface is flat: «פעילות אחרונה» interleaves all sessions by
 * time, and the drill lists group by TEXT (so the session that produced a row is gone). `ev:'action'`
 * rows — logged since #84 / #182 precisely so a session replays end-to-end — were stored and never
 * shown anywhere. A step keeps whatever its event carried, so the timeline reads as what the student
 * actually did: the utterance, its outcome, the LLM's committed canonical commands, the edits/sliders.
 */
export interface SessionStep {
  ts: string;
  ev: 'submit' | 'action';
  utterance?: string;
  locale?: string;
  source?: string;
  result?: string;
  /** submit (LLM path): the committed canonical commands (#84 / #182). */
  commands?: string;
  /** action: edit / slider / show-another / delete / undo / … */
  action?: string;
  detail?: string;
  /** submit: the profile's outcome key (`parsed` / `llm-built` / `not-understood` / …). */
  outcome?: string;
}

/** One session (`sid` = one page load) with its ordered steps — the unit the sessions view renders. */
export interface SessionRow {
  sid: string;
  /** Salted visitor hash — the same person across sessions, never an IP. */
  iph: string;
  rel: string;
  locale: string;
  start: string;
  end: string;
  submits: number;
  /** How many of this session's submits landed in the profile's real-gap bucket. */
  gaps: number;
  steps: SessionStep[];
  /** Steps beyond the per-session cap, dropped from `steps` (stated, never silently truncated). */
  dropped: number;
}

/** Per-session step cap — a runaway session can't blow up the page; the overflow is REPORTED, not hidden. */
const MAX_SESSION_STEPS = 300;

/**
 * Group events into per-session timelines (#470), newest session first.
 *
 * Pure + unit-tested, like `aggregate`. Log order is preserved inside a session (the file is appended
 * chronologically, and equal-millisecond events must not be scrambled by a sort). Events with no `sid`
 * are NOT merged into a synthetic session — that would invent a conversation that never happened; they
 * are counted and reported by the caller instead.
 */
export function sessionsOf(events: UsageEvent[], profile: DashboardProfile = PROFILE_2D): SessionRow[] {
  const rows = new Map<string, SessionRow>();
  for (const e of events) {
    if (!e.sid) continue; // unattributable — counted by `unattributedCount`, never folded into a fake session
    const ts = e.serverTs ?? e.t ?? '';
    let row = rows.get(e.sid);
    if (!row) {
      row = { sid: e.sid, iph: e.iph ?? '', rel: e.rel ?? '', locale: '', start: ts, end: ts, submits: 0, gaps: 0, steps: [], dropped: 0 };
      rows.set(e.sid, row);
    }
    if (ts) {
      if (!row.start || ts < row.start) row.start = ts;
      if (ts > row.end) row.end = ts;
    }
    if (e.rel && !row.rel) row.rel = e.rel;
    if (e.ev === 'session') continue; // the page-load marker only bounds the session; it is not a step
    if (e.ev === 'submit') {
      row.submits++;
      if (e.locale) row.locale = e.locale;
    }
    const outcome = e.ev === 'submit' ? profile.classify(e) : undefined;
    if (outcome === profile.gapKey) row.gaps++;
    if (row.steps.length >= MAX_SESSION_STEPS) {
      row.dropped++;
      continue;
    }
    row.steps.push({
      ts,
      ev: e.ev,
      ...(e.utterance !== undefined ? { utterance: e.utterance } : {}),
      ...(e.locale !== undefined ? { locale: e.locale } : {}),
      ...(e.source !== undefined ? { source: e.source } : {}),
      ...(e.result !== undefined ? { result: e.result } : {}),
      ...(e.commands !== undefined ? { commands: e.commands } : {}),
      ...(e.action !== undefined ? { action: e.action } : {}),
      ...(e.detail !== undefined ? { detail: e.detail } : {}),
      ...(outcome ? { outcome } : {}),
    });
  }
  return [...rows.values()].sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
}

/** Events the sessions view cannot attribute to a session (no `sid`) — surfaced so nothing vanishes silently. */
export const unattributedCount = (events: UsageEvent[]): number =>
  events.filter((e) => !e.sid && (e.ev === 'submit' || e.ev === 'action')).length;

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

/** Dashboard filter state, parsed from the query string (`?since=YYYY-MM-DD&rel=<build>&view=gaps&sid=abc`). */
export interface Filter {
  since?: string;
  rel?: string;
  /** Which drill view is open (`gaps` / `scope` / `sessions`), if any. Not a data filter — a view toggle. */
  view?: string;
  /** Sessions view: show only this session id (a bug report's «give me the session id» — docs/22 §2b). */
  sid?: string;
}

/** Build a dashboard query string from the filter (+ overrides), dropping empties. `view:undefined` closes a drill. */
function queryString(cur: Filter, extra: Partial<Filter> = {}): string {
  const f = { ...cur, ...extra };
  const parts: string[] = [];
  if (f.since) parts.push(`since=${encodeURIComponent(f.since)}`);
  if (f.rel && f.rel !== 'all') parts.push(`rel=${encodeURIComponent(f.rel)}`);
  if (f.view) parts.push(`view=${encodeURIComponent(f.view)}`);
  if (f.sid && f.view === 'sessions') parts.push(`sid=${encodeURIComponent(f.sid)}`); // a session pin belongs to that view only
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
  details.sess{border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;background:#fcfcfd}
  details.sess>summary{cursor:pointer;padding:8px 10px;font-size:13px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;list-style:none}
  details.sess>summary::-webkit-details-marker{display:none}
  details.sess>summary::before{content:'▸';color:#6b7280;font-size:11px}
  details.sess[open]>summary::before{content:'▾'}
  details.sess[open]>summary{border-bottom:1px solid #f0f1f3;background:#fff}
  details.sess .body{padding:4px 10px 10px}
  .sess .gapn{color:#b91c1c;font-weight:600}
  .sess .okn{color:#059669}
  .stepn{color:#9ca3af;font-size:11px}
  .cmds{color:#6b7280;font-size:11px;direction:ltr;display:block;margin-top:3px;white-space:pre-wrap;word-break:break-word}
  .act{background:#eef2ff;color:#3730a3;border-radius:4px;padding:1px 6px;font-size:12px}
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

/**
 * The GAP card's drill panel (#183) — the one list the operator opens to decide what to build. Rendered
 * from prod-TIME outcomes but re-verified against the CURRENT code via the triage verdict map when one
 * is present: rows the current code BUILDS move out of the worklist into a «תוקן מאז» section, every
 * remaining row carries its current verdict, and the header states which revision the verdicts were
 * computed against (and when). Without a map, the header says plainly that nothing was re-verified.
 */
function gapDrillPanel(title: string, rows: DrillRow[], closeHref: string, fmt: (ts: string | null) => string, vm: VerdictMap | null): string {
  const head = `<div class="top" style="margin-bottom:8px"><h2 style="flex:1;margin:0">${esc(title)}</h2><a class="chip" href="${esc(closeHref)}">סגירה ✕</a></div>`;
  const vNote = vm
    ? `<div class="muted" style="margin-bottom:8px">נבדק מחדש מול הקוד הנוכחי: גרסה <b>${esc(vm.rev)}</b> · ${esc(fmt(vm.generatedAt || null))} (ריצת triage אחרונה)</div>`
    : `<div class="muted" style="margin-bottom:8px">⚠ אין נתוני אימות — הרשימה משקפת את התוצאה <b>בזמן ההקלדה</b> בלבד; ייתכן שחלקה כבר תוקן (הרץ log-triage לעדכון)</div>`;
  if (!rows.length) return `<div class="panel">${head}${vNote}<div class="muted">אין פריטים בטווח/הסינון הנוכחי 🎉</div></div>`;
  const open = vm ? rows.filter((r) => !VERDICT_FIXED.has(verdictOf(vm, r.utterance) ?? '')) : rows;
  const fixed = vm ? rows.filter((r) => VERDICT_FIXED.has(verdictOf(vm, r.utterance) ?? '')) : [];
  const tr = (r: DrillRow, withVerdict: boolean) => {
    const v = withVerdict ? verdictOf(vm, r.utterance) : null;
    const vCell = withVerdict ? `<td class="muted">${v ? esc(VERDICT_LABELS[v] ?? v) : '—'}</td>` : '';
    return `<tr><td><code>${esc(r.utterance)}</code></td><td>${r.count}</td>
       <td class="muted">${esc(r.locale)}</td><td class="muted">${esc(fmt(r.lastSeen || null))}</td>${vCell}</tr>`;
  };
  const headRow = (withVerdict: boolean) =>
    `<tr><th>משפט</th><th style="width:60px">פעמים</th><th style="width:50px">שפה</th><th style="width:130px">נראה לאחרונה</th>${withVerdict ? '<th style="width:170px">מצב כיום</th>' : ''}</tr>`;
  const openTbl = open.length
    ? `<table>${headRow(!!vm)}${open.map((r) => tr(r, !!vm)).join('')}</table>`
    : `<div class="muted">אין פערים פתוחים בטווח 🎉</div>`;
  const fixedTbl = fixed.length
    ? `<h3 style="margin:14px 0 6px">✓ תוקן מאז — נבנה בקוד הנוכחי (${fixed.length})</h3>
       <table>${headRow(false)}${fixed.map((r) => tr(r, false)).join('')}</table>`
    : '';
  return `<div class="panel">${head}${vNote}${openTbl}${fixedTbl}</div>`;
}

/** How many sessions one page renders (newest first); the remainder is stated, never silently cut. */
const MAX_SESSIONS_SHOWN = 60;

/**
 * Render an LLM step's committed `commands` readably. The field is a JSON string whose SHAPE belongs to
 * the product (2-D command objects, 3-D canonical lines), and this renderer serves both — so it stays
 * structural: an array is flattened to `type value value · …`, and anything that doesn't parse is shown
 * verbatim. The raw JSON is kept in the row's `title`, so the compaction never hides what was committed.
 */
export function formatCommands(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw; // not JSON (or truncated by the 900-char cap) — show it as stored
  }
  if (!Array.isArray(parsed)) return raw;
  return parsed
    .map((c) => {
      if (typeof c === 'string') return c;
      if (!c || typeof c !== 'object') return String(c);
      const o = c as Record<string, unknown>;
      const rest = Object.entries(o)
        .filter(([k]) => k !== 'type')
        .map(([, v]) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)));
      return [o.type !== undefined ? String(o.type) : '', ...rest].join(' ').trim();
    })
    .join(' · ');
}

/** One step line of a session timeline: the utterance (or the store action) + what came of it. */
function sessionStepRow(st: SessionStep, i: number, profile: DashboardProfile): string {
  const time = st.ts ? esc(st.ts.slice(11, 19)) : '';
  const body =
    st.ev === 'action'
      ? `<span class="act">⚙ ${esc(st.action ?? '')}</span>${st.detail ? ` <code>${esc(st.detail)}</code>` : ''}`
      : `<code>${esc(st.utterance ?? '')}</code>${
          st.commands ? `<span class="cmds" title="${esc(st.commands)}">↳ ${esc(formatCommands(st.commands))}</span>` : ''
        }`;
  const verdict =
    st.ev === 'submit' ? (profile.outcomeLabels[st.outcome ?? ''] ?? st.result ?? '') : (st.result ?? '');
  return `<tr><td class="stepn" style="width:26px">${i + 1}</td><td class="muted" style="width:64px">${time}</td>
    <td>${body}</td><td class="muted" style="width:150px">${esc(verdict)}</td></tr>`;
}

/** One session block: a summary line (when / who / how many / how many gaps) that expands to its steps. */
function sessionBlock(r: SessionRow, base: string, cur: Filter, fmt: (ts: string | null) => string, profile: DashboardProfile, open: boolean): string {
  const pinHref = `${esc(base)}${queryString(cur, { view: 'sessions', sid: r.sid })}`;
  const counts = `${r.submits} משפטים${r.gaps ? ` · <span class="gapn">${r.gaps} פערים</span>` : ''}`;
  const acts = r.steps.filter((s) => s.ev === 'action').length;
  // A tab left open overnight ends on a LATER day — showing the bare HH:MM would read as time running backwards.
  const sameDay = r.start.slice(0, 10) === r.end.slice(0, 10);
  const summary = `<summary>
      <b>${esc(fmt(r.start || null))}</b>
      <span class="muted">→ ${esc(sameDay ? r.end.slice(11, 16) : fmt(r.end || null))}</span>
      <code>${esc(r.sid)}</code>
      <span>${counts}</span>
      ${acts ? `<span class="muted">${acts} פעולות</span>` : ''}
      ${r.locale ? `<span class="muted">${esc(r.locale)}</span>` : ''}
      ${r.rel ? `<span class="muted">גרסה ${esc(r.rel)}</span>` : ''}
      <span class="muted">מבקר ${esc(r.iph.slice(0, 6))}</span>
      <a class="chip" href="${pinHref}" style="margin-inline-start:auto">קישור לסשן ›</a>
    </summary>`;
  const body = r.steps.length
    ? `<div class="body"><table>${r.steps.map((s, i) => sessionStepRow(s, i, profile)).join('')}</table>
       ${r.dropped ? `<div class="muted" style="margin-top:6px">…ועוד ${r.dropped} צעדים מעבר לתקרת התצוגה</div>` : ''}</div>`
    : `<div class="body muted">כניסה ללא פעולות (נטענה ולא הוקלד דבר)</div>`;
  return `<details class="sess"${open ? ' open' : ''}>${summary}${body}</details>`;
}

/**
 * The SESSIONS view (#470) — what one user's visit actually looked like, in order.
 *
 * Every other utterance surface on this page is flat: «פעילות אחרונה» interleaves all sessions by time and
 * the drill lists group by text, so "what did this student try, and in what order" was unanswerable without
 * grepping `events.jsonl` on the box. Sessions are newest-first, each expanding to its ordered steps
 * (submits + the store actions from #84/#182), and `?sid=` pins one — the surface a bug report's session id
 * lands on (docs/22 §2b).
 */
function sessionsPanel(
  rows: SessionRow[],
  base: string,
  cur: Filter,
  closeHref: string,
  fmt: (ts: string | null) => string,
  profile: DashboardProfile,
  unattributed: number,
): string {
  const head = `<div class="top" style="margin-bottom:8px"><h2 style="flex:1;margin:0">סשנים — מה הוקלד בכל כניסה, לפי הסדר</h2><a class="chip" href="${esc(closeHref)}">סגירה ✕</a></div>`;
  // Look up one session by id (the id a student/bug report hands over), keeping the date + release filters.
  const lookup = `<form class="filters" method="get" action="${esc(base)}" style="margin:0 0 12px">
      <input type="hidden" name="view" value="sessions">
      ${cur.since ? `<input type="hidden" name="since" value="${esc(cur.since)}">` : ''}
      ${cur.rel && cur.rel !== 'all' ? `<input type="hidden" name="rel" value="${esc(cur.rel)}">` : ''}
      <label>מזהה סשן <input name="sid" value="${esc(cur.sid ?? '')}" placeholder="לדוגמה k3f9x2ab"></label>
      <button type="submit">הצג</button>
      ${cur.sid ? `<a class="chip" href="${esc(base)}${esc(queryString({ ...cur, sid: undefined }))}">כל הסשנים</a>` : ''}
    </form>`;
  const pinned = cur.sid ? rows.filter((r) => r.sid === cur.sid) : rows;
  const note = unattributed
    ? `<div class="muted" style="margin-bottom:8px">${unattributed} אירועים ללא מזהה סשן אינם מוצגים כאן (הם נספרים בשאר הדוח)</div>`
    : '';
  if (!pinned.length) {
    const why = cur.sid
      ? `לא נמצא סשן <code>${esc(cur.sid)}</code> בטווח הסינון הנוכחי (ייתכן שהוא מחוץ לטווח התאריכים או שפג בשמירת הנתונים)`
      : 'אין סשנים בטווח/הסינון הנוכחי';
    return `<div class="panel">${head}${lookup}${note}<div class="muted">${why}</div></div>`;
  }
  const shown = pinned.slice(0, MAX_SESSIONS_SHOWN);
  // A pinned session (or a lone one) opens expanded; otherwise the list stays scannable and each opens on click.
  const openAll = !!cur.sid || shown.length === 1;
  const more =
    pinned.length > shown.length
      ? `<div class="muted" style="margin-top:8px">מוצגים ${shown.length} מתוך ${pinned.length} סשנים בטווח — צמצם את הטווח כדי לראות את השאר</div>`
      : '';
  return `<div class="panel">${head}${lookup}${note}
    ${shown.map((r) => sessionBlock(r, base, cur, fmt, profile, openAll)).join('')}${more}</div>`;
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
  const keepView =
    (cur.view ? `<input type="hidden" name="view" value="${esc(cur.view)}">` : '') +
    (cur.sid && cur.view === 'sessions' ? `<input type="hidden" name="sid" value="${esc(cur.sid)}">` : '');
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
  vm: VerdictMap | null = null,
  sessions: SessionRow[] = [],
  unattributed = 0,
): string {
  const fmt = (ts: string | null) => (ts ? ts.replace('T', ' ').slice(0, 16) : '—');
  const range = s.firstSeen ? `${fmt(s.firstSeen)} — ${fmt(s.lastSeen)}` : 'אין נתונים';
  const filtered = !!(cur.since || (cur.rel && cur.rel !== 'all'));
  // #183: the gap CARD counts prod-time events forever; with a verdict map, show the still-OPEN share
  // (events whose utterance the current code does NOT build) so the number stops overstating the work.
  const fixedEvents = vm ? s.gapUtterances.filter((r) => VERDICT_FIXED.has(verdictOf(vm, r.utterance) ?? '')).reduce((n, r) => n + r.count, 0) : 0;
  const gapCount = s.realGaps - fixedEvents;
  const gapLabel = vm && fixedEvents > 0 ? `${profile.gapCard} · תוקנו מאז: ${fixedEvents}` : profile.gapCard;
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
       ${cardLink(s.sessions, 'כניסות (sessions)', `${esc(base)}${queryString(cur, { view: cur.view === 'sessions' ? undefined : 'sessions', sid: undefined })}`, cur.view === 'sessions')}
       ${card(s.submits, 'פעולות / משפטים')}
       ${card(s.llmFallbacks, 'נפילה ל-LLM')}
       ${cardLink(gapCount, gapLabel, `${esc(base)}${queryString(cur, { view: cur.view === 'gaps' ? undefined : 'gaps' })}`, cur.view === 'gaps')}
       ${cardLink(s.outOfScope, profile.secondaryCard, `${esc(base)}${queryString(cur, { view: cur.view === 'scope' ? undefined : 'scope' })}`, cur.view === 'scope')}
     </div>
     ${
       cur.view === 'gaps'
         ? gapDrillPanel(profile.gapDrillTitle, s.gapUtterances, `${esc(base)}${queryString(cur, { view: undefined })}`, fmt, vm)
         : cur.view === 'scope'
           ? drillPanel(profile.secondaryDrillTitle, s.scopeUtterances, `${esc(base)}${queryString(cur, { view: undefined })}`, fmt)
           : cur.view === 'sessions'
             ? sessionsPanel(sessions, base, cur, `${esc(base)}${queryString(cur, { view: undefined, sid: undefined })}`, fmt, profile, unattributed)
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
       <table><tr><th style="width:130px">זמן</th><th style="width:50px">שפה</th><th>משפט</th><th style="width:120px">תוצאה</th><th style="width:90px">סשן</th></tr>
       ${
         s.recent.length
           ? s.recent
               .map(
                 (e) =>
                   `<tr><td class="muted">${esc(fmt(e.serverTs ?? e.t ?? null))}</td>
                    <td>${esc(e.locale ?? '')}</td>
                    <td><code>${esc(e.utterance ?? '')}</code></td>
                    <td class="muted">${esc(profile.outcomeLabels[profile.classify(e)] ?? e.result ?? '')}</td>
                    <td>${e.sid ? `<a class="chip" href="${esc(base)}${queryString(cur, { view: 'sessions', sid: e.sid })}">${esc(e.sid)}</a>` : '<span class="muted">—</span>'}</td></tr>`,
               )
               .join('')
           : '<tr><td class="muted">אין נתונים עדיין</td><td></td><td></td><td></td><td></td></tr>'
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
/** Build a ToolConfig from the config form's fields (A3): absent show_<id> ⇒ hidden; numeric
 *  order_<id> ranks the listed ids; empty overrides are simply not recorded. */
export function configFromForm(params: URLSearchParams): ToolConfig {
  const hidden: string[] = [];
  const labels: Record<string, string> = {};
  const icons: Record<string, string> = {};
  const ranked: { id: string; rank: number }[] = [];
  for (const p of productRegistry.products) {
    if (params.get(`show_${p.id}`) === null) hidden.push(p.id);
    const label = (params.get(`label_${p.id}`) ?? '').trim();
    if (label) labels[p.id] = label;
    const icon = (params.get(`icon_${p.id}`) ?? '').trim();
    if (icon) icons[p.id] = icon;
    const rank = Number((params.get(`order_${p.id}`) ?? '').trim());
    if (Number.isFinite(rank) && (params.get(`order_${p.id}`) ?? '').trim() !== '')
      ranked.push({ id: p.id, rank });
  }
  const quickCommands = (params.get('quick') ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const cfg: ToolConfig = {};
  const switcher: ToolConfig['switcher'] = {};
  if (hidden.length) switcher.hidden = hidden;
  if (Object.keys(labels).length) switcher.labels = labels;
  if (Object.keys(icons).length) switcher.icons = icons;
  if (ranked.length) switcher.order = ranked.sort((a, b) => a.rank - b.rank).map((r) => r.id);
  if (Object.keys(switcher).length) cfg.switcher = switcher;
  if (quickCommands.length) cfg.quickCommands = quickCommands;
  return cfg;
}

/** The operator config form (A3, #662). Curation only: the rows ARE the registry — nothing can be
 *  added here, only hidden, reordered, relabeled. Refusals render inline, naming each entry. */
function configPage(
  base: string,
  profile: DashboardProfile,
  tool: string,
  cfg: ToolConfig,
  refusals: ConfigRefusal[],
  saved: boolean,
): string {
  const sw = cfg.switcher ?? {};
  const hiddenSet = new Set(sw.hidden ?? []);
  const orderOf = (id: string) => {
    const i = (sw.order ?? []).indexOf(id);
    return i < 0 ? '' : String(i + 1);
  };
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rows = productRegistry.products
    .map(
      (p) => `<tr>
        <td><code>${p.id}</code></td>
        <td style="text-align:center"><input type="checkbox" name="show_${p.id}" ${hiddenSet.has(p.id) ? '' : 'checked'}></td>
        <td><input type="number" name="order_${p.id}" value="${orderOf(p.id)}" min="1" style="width:4em"></td>
        <td><input type="text" name="label_${p.id}" value="${esc(sw.labels?.[p.id] ?? '')}" placeholder="ברירת מחדל: תווית הכלי"></td>
        <td><input type="text" name="icon_${p.id}" value="${esc(sw.icons?.[p.id] ?? '')}" placeholder="${esc(p.icon)}" style="width:5em"></td>
      </tr>`,
    )
    .join('\n');
  const refusalBlock = refusals.length
    ? `<div class="refusals"><strong>לא נשמר — יש לתקן:</strong><ul>${refusals
        .map((r) => `<li><code>${esc(r.field)}</code> · <code dir="ltr">${esc(r.entry)}</code> — ${esc(r.why)}</li>`)
        .join('')}</ul></div>`
    : '';
  const savedBlock = saved ? '<div class="saved">נשמר. הבונים יקראו את הקונפיגורציה בטעינה הבאה.</div>' : '';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>${esc(profile.title)} — קונפיגורציה</title>
<style>
 body{font-family:system-ui,'Segoe UI',sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px;max-width:860px;margin-inline:auto}
 h1{font-size:20px} h2{font-size:15px;margin-top:24px}
 table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:8px}
 th,td{padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:start;font-size:14px}
 input[type=text],input[type=number],textarea{border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;font-size:14px;width:100%;box-sizing:border-box}
 textarea{font-family:ui-monospace,Consolas,monospace;direction:ltr;min-height:90px}
 button{background:#2563eb;color:#fff;border:1px solid #2563eb;border-radius:8px;padding:9px 18px;font-size:14px;cursor:pointer;margin-top:16px}
 .refusals{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:10px 14px;margin:14px 0}
 .saved{background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;border-radius:8px;padding:10px 14px;margin:14px 0}
 .note{color:#64748b;font-size:13px} a{color:#2563eb}
</style></head><body>
<h1>קונפיגורציה</h1>
<p class="note">עריכה עבור הכלי: ${productRegistry.products
    .map((p) =>
      p.id === tool
        ? `<strong>${esc(p.icon)} ${esc(p.id)}</strong>`
        : `<a href="${base}/config?tool=${p.id}">${esc(p.icon)} ${esc(p.id)}</a>`,
    )
    .join(' · ')}</p>
<p class="note">הקונפיגורציה <strong>בוחרת מבין הקיים</strong>: אפשר להסתיר, לסדר ולכנות בונים רשומים —
אי אפשר להמציא בונה, ופקודה מהירה שהדקדוק אינו מקבל אינה נשמרת. קונפיגורציה חסרה או שבורה = הבונים
עובדים עם הרוסטר המובנה.</p>
${savedBlock}${refusalBlock}
<form method="post" action="${base}/config">
<input type="hidden" name="tool" value="${esc(tool)}">
<h2>הבורר (רוסטר הבונים)</h2>
<table><tr><th>מזהה</th><th>מוצג</th><th>סדר</th><th>תווית (עוקפת)</th><th>סמל</th></tr>
${rows}
</table>
<h2>פקודות מהירות (שורה לפקודה) — מאומתות מול הדקדוק בשמירה</h2>
<textarea name="quick" placeholder="z1 = 3+4i">${esc((cfg.quickCommands ?? []).join('\n'))}</textarea>
<div><button type="submit">שמירה</button> <a href="${base}" style="margin-inline-start:12px">חזרה לדוח</a></div>
</form>
</body></html>`;
}

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

  // ── the operator config page (A3, #662) — curation bounded by choose-among-what-exists ──────
  // One page curates EVERY tool (?tool=<registry id>; default: this dashboard's own tool) —
  // complex has no dashboard mount of its own yet (it does not log), but its curation must not
  // wait for one.
  if (path.endsWith('/config')) {
    const configDir = dirname(opts.logPath ?? eventsLogPath());
    const q0 = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
    const known = new Set(productRegistry.products.map((p) => p.id));
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const params = new URLSearchParams(body);
      const tool = known.has(params.get('tool') ?? '') ? (params.get('tool') as string) : profile.tool;
      const cfg = configFromForm(params);
      const refusals = validateToolConfig(tool, cfg);
      if (refusals.length > 0)
        return send(res, 422, configPage(base, profile, tool, cfg, refusals, false));
      await writeToolConfig(configDir, tool, cfg);
      res.statusCode = 303;
      res.setHeader('location', `${base}/config?tool=${tool}&saved=1`);
      res.end();
      return;
    }
    const tool = known.has(q0.get('tool') ?? '') ? (q0.get('tool') as string) : profile.tool;
    const current = (await readToolConfig(configDir, tool)) ?? {};
    return send(res, 200, configPage(base, profile, tool, current, [], q0.get('saved') === '1'));
  }

  const logPath = opts.logPath ?? eventsLogPath();
  const all = await readEvents(logPath);
  // #183: the triage verdict map, uploaded beside the events file (`triage.mjs`). Absent → the gap
  // drill states plainly that nothing was re-verified, never implying verification that didn't happen.
  const vm = await readVerdicts(opts.verdictsPath ?? join(dirname(logPath), profile.verdictsFile ?? 'verdicts.json'));
  // Filter state from the query string (?since=YYYY-MM-DD&rel=<build>&view=gaps|scope|sessions&sid=…) — empty = show everything.
  const q = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
  const view = q.get('view');
  const cur: Filter = {
    since: q.get('since') || undefined,
    rel: q.get('rel') || undefined,
    view: view === 'gaps' || view === 'scope' || view === 'sessions' ? view : undefined, // ignore unknown view values
    sid: q.get('sid')?.trim().slice(0, 32) || undefined, // a session id is short; bound what a URL can inject
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
  // The per-session timelines (#470) are built only for the view that shows them — every other view pays nothing.
  const sessions = cur.view === 'sessions' ? sessionsOf(events, profile) : [];
  const unattributed = cur.view === 'sessions' ? unattributedCount(events) : 0;
  return send(res, 200, dashboard(base, aggregate(events, profile), releases, cur, presets, profile, vm, sessions, unattributed));
}
