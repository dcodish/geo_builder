/**
 * The management console's sections (#2868, ADR-W-208), one per question the operator asks. Pure over a
 * Snapshot and the date: no I/O, no clock, so each is tested with recorded data.
 *
 * Judgement (dossiers, triage clusters, the readiness measure) is written by sessions into issues and repo
 * files; these functions only read it.
 */
import type { Commit, DeployRow, Issue, Pr, Snapshot } from './snapshot';

// ── the plan file (ops/plan.json) ────────────────────────────────────────────

export type ProductKey = 'an' | 'v3' | 'd2' | 'cx' | 'pr';

export interface Workstream {
  id: string;
  p: ProductKey;
  name: string;
  goal?: string;
  done?: string;
  from: number;
  to: number;
  order?: number;
  issues: number[];
  milestone?: boolean;
  played?: string;
  decideWeek?: number;
}

export interface Plan {
  title: string;
  start: string;
  end: string;
  weeks: { n: number; from: string; label: string }[];
  groups: { p: ProductKey; label: string }[];
  workstreams: Workstream[];
  calendar?: { note?: string; topics: { name: string; from: string; to: string | null }[] };
  pulled?: { issue: number; week: number; at: string; by: string }[];
  afterPlan?: { issues: number[]; note?: string };
}

export function asPlan(x: unknown): Plan | null {
  const p = x as Plan | null;
  return p && Array.isArray(p.weeks) && Array.isArray(p.workstreams) ? p : null;
}

// ── shared helpers ────────────────────────────────────────────────────────────

export const PRODUCTS = ['analytic', '3d', '2d', 'complex', 'server', 'workspace'] as const;
export type Product = (typeof PRODUCTS)[number];

export const productOf = (i: Issue): Product | null => PRODUCTS.find((p) => i.labels.includes(p)) ?? null;
export const priorityOf = (i: Issue): string => ['P1', 'P2', 'P3', 'later'].find((p) => i.labels.includes(p)) ?? '—';
export const kindOf = (i: Issue): 'bug' | 'feature' | 'debt' | 'other' =>
  i.labels.includes('bug') ? 'bug' : i.labels.includes('feature') ? 'feature' : i.labels.includes('debt') ? 'debt' : 'other';

const day = (iso: string) => iso.slice(0, 10);
const dayGap = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / 864e5);

export interface Ctx {
  s: Snapshot;
  today: string; // YYYY-MM-DD
  byN: Map<number, Issue>;
  plan: Plan | null;
}

export function makeCtx(s: Snapshot, today: string): Ctx {
  const byN = new Map<number, Issue>();
  for (const i of [...s.parked, ...s.recent, ...s.open]) byN.set(i.n, i);
  return { s, today, byN, plan: asPlan(s.files.plan) };
}

/** One markdown section's text: from `## <heading…>` to the next `## `. */
export function section(body: string, heading: RegExp): string | null {
  const lines = body.split('\n');
  const at = lines.findIndex((l) => /^#{2,3}\s/.test(l) && heading.test(l.replace(/^#+\s*/, '')));
  if (at < 0) return null;
  const level = (lines[at].match(/^#+/) ?? ['##'])[0].length;
  const end = lines.findIndex((l, k) => k > at && new RegExp(`^#{1,${level}}\\s`).test(l));
  return lines.slice(at + 1, end < 0 ? undefined : end).join('\n').trim();
}

// ── 1 · What needs me now? ────────────────────────────────────────────────────

export interface Option {
  key: string;
  label: string;
}

/**
 * The lettered options a decision dossier offers: `- **A** — …`, `**(b)** …`, `A) …`, `Option C: …`.
 * Only a list of two or more counts; anything else is answered in free text.
 */
export function optionsOf(body: string): { options: Option[]; recommended: string | null } {
  const found = new Map<string, string>();
  const re = /^\s*(?:[-*]\s*)?(?:\*\*)?(?:option\s+)?\(?([A-Fa-f])[).:]?(?:\*\*)?\s*[—–:.)-]\s*(.+)$/i;
  for (const line of body.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    const key = m[1].toUpperCase();
    if (!found.has(key)) found.set(key, m[2].replace(/\*\*/g, '').trim());
  }
  const keys = [...found.keys()].sort();
  // A real option list starts at A and has no gaps.
  const run = keys.filter((k, i) => k === String.fromCharCode(65 + i));
  if (run.length < 2) return { options: [], recommended: null };
  const rec = body.match(/recommend(?:ed|ation)?[^A-Za-z\n]{0,20}(?:\*\*)?\(?(?:option\s+)?([A-F])\b/i);
  return { options: run.map((k) => ({ key: k, label: found.get(k)! })), recommended: rec ? rec[1].toUpperCase() : null };
}

export interface PlayBlock {
  path: string;
  lines: string[];
  note: string;
}

/** A PR's `## Play (`/path`)` sections: the route, the utterances in the code block, and the look-for text after it. */
export function playBlocks(body: string): PlayBlock[] {
  const out: PlayBlock[] = [];
  const parts = body.split(/^##+\s+/m);
  for (const p of parts) {
    const head = p.split('\n')[0];
    if (!/^play\b|^🎮|^נסו|^test/i.test(head)) continue;
    const path = (head.match(/`(\/[^`]*)`/) ?? [])[1] ?? '/';
    const rest = p.slice(head.length);
    for (const m of rest.matchAll(/```[^\n]*\n([\s\S]*?)```([\s\S]*?)(?=```|$)/g)) {
      out.push({ path, lines: m[1].split('\n').map((l) => l.trim()).filter(Boolean), note: m[2].trim() });
    }
  }
  return out;
}

/** The `[proposed]` lines of an issue's «What the student will see» section. */
export function proposedLines(body: string): string[] {
  const sec = section(body, /what the student will see/i);
  if (!sec) return [];
  return sec.split('\n').filter((l) => /\[proposed\]/i.test(l)).map((l) => l.replace(/^\s*[-*]\s*/, '').trim());
}

export interface Decision {
  issue: Issue;
  question: string;
  options: Option[];
  recommended: string | null;
}

export interface AuditCard {
  id: string;
  sheet: string;
  product: string;
  url: string;
  lines: string[];
  lookFor: string;
  queued: string;
}

export interface NeedsMe {
  p1: Issue[];
  decisions: Decision[];
  prs: (Pr & { plays: PlayBlock[] })[];
  audits: AuditCard[];
  plans: { issue: Issue; proposed: string[] }[];
  round: { issue: Issue; waiting: string | null } | null;
}

function questionOf(body: string): string {
  const sec =
    section(body, /^(the )?(decision|question|ruling|needs|what (only )?(the operator|you) (must|can) (decide|settle))/i) ??
    section(body, /operator's note|what this is/i) ??
    body;
  return sec.replace(/\r/g, '').trim().slice(0, 900);
}

export function needsMe(ctx: Ctx): NeedsMe {
  const open = ctx.s.open;
  const sa = ctx.s.files.spotAudits as { pending?: { sheet: string; id: string; product: string; base?: string; path?: string; lines?: string[]; lookFor?: string; queued?: string }[] } | null;
  const running = ctx.s.rounds.find((r) => r.open) ?? null;
  return {
    p1: open.filter((i) => i.labels.includes('P1')),
    decisions: open
      .filter((i) => i.labels.includes('needs-operator'))
      .map((i) => ({ issue: i, question: questionOf(i.body), ...optionsOf(i.body) })),
    prs: ctx.s.prs.filter((p) => !p.draft).map((p) => ({ ...p, plays: playBlocks(p.body) })),
    audits: (sa?.pending ?? []).map((p) => ({
      id: p.id,
      sheet: p.sheet,
      product: p.product,
      url: (p.base ?? 'https://themathbible.com') + (p.path ?? '/'),
      lines: p.lines ?? [],
      lookFor: p.lookFor ?? '',
      queued: p.queued ?? '',
    })),
    plans: open
      .filter((i) => !i.labels.includes('auto-ok') && !i.labels.includes('needs-operator') && !i.labels.includes('awaiting-play'))
      .map((i) => ({ issue: i, proposed: proposedLines(i.body) }))
      .filter((x) => x.proposed.length > 0),
    round: running ? { issue: running, waiting: section(running.body, /waiting on you/i) } : null,
  };
}

// ── 2 · What happened since I last looked? ───────────────────────────────────

export interface SinceLast {
  since: string;
  commits: Commit[];
  fixed: Issue[];
  shelved: Issue[];
  filed: Issue[];
  deploys: DeployRow[];
  round: Issue | null;
}

export function sinceLast(ctx: Ctx, since: string): SinceLast {
  const closedAfter = ctx.s.recent.filter((i) => !i.open && i.closed && i.closed >= since);
  const shelf = (i: Issue) => i.reason === 'not_planned' || i.reason === 'duplicate' || i.labels.includes('icebox');
  return {
    since,
    commits: ctx.s.commits.filter((c) => c.date >= since),
    fixed: closedAfter.filter((i) => !shelf(i)).sort((a, b) => (b.closed ?? '').localeCompare(a.closed ?? '')),
    shelved: closedAfter.filter(shelf),
    filed: ctx.s.recent.filter((i) => i.created >= since).sort((a, b) => b.created.localeCompare(a.created)),
    deploys: ctx.s.deploys.filter((d) => d.date >= day(since)),
    round: ctx.s.rounds[0] ?? null,
  };
}

// ── 3 · Are we on pace? ───────────────────────────────────────────────────────

export type WsStatusKey = 'done' | 'ontrack' | 'early' | 'watch' | 'behind' | 'idle';

export interface WsRow {
  ws: Workstream;
  open: number;
  closed: number;
  unknown: number;
  bugOpen: number;
  featOpen: number;
  needs: number;
  status: WsStatusKey;
  why: string;
}

export const STATUS_LABEL: Record<WsStatusKey, string> = {
  done: 'הושלם',
  ontrack: 'בקצב',
  early: 'התחיל מוקדם',
  watch: 'לשים לב',
  behind: 'בפיגור',
  idle: 'טרם התחיל',
};

export function currentWeek(plan: Plan, today: string): number {
  if (today > plan.end) return plan.weeks.length + 1;
  return plan.weeks.filter((w) => w.from <= today).length;
}

/**
 * The roadmap page's pace rule, unchanged (ADR-W-159): on track when issues close at least as fast as the
 * row's weeks pass; watch under that; behind under 60% of it, or past its last week with work open. A row's
 * first week never counts against it.
 */
export function wsRow(plan: Plan, ws: Workstream, byN: Map<number, Issue>, today: string): WsRow {
  let open = 0, closed = 0, unknown = 0, bugOpen = 0, featOpen = 0, needs = 0;
  for (const n of ws.issues) {
    const i = byN.get(n);
    // Not open, and not updated since the plan began: it was closed before then.
    if (!i) { closed++; unknown++; continue; }
    if (i.open) {
      open++;
      if (i.labels.includes('bug')) bugOpen++; else featOpen++;
      if (i.labels.includes('needs-operator')) needs++;
    } else closed++;
  }
  const cw = currentWeek(plan, today);
  const start = plan.weeks[ws.from - 1]?.from ?? plan.start;
  const total = open + closed;
  const mk = (status: WsStatusKey, why: string): WsRow => ({ ws, open, closed, unknown, bugOpen, featOpen, needs, status, why });
  if (ws.milestone) {
    if (ws.played) return mk('done', `שיחקת את הגיליון ב-${ws.played}.`);
    if (cw > ws.to) return mk('behind', 'השבוע שלה עבר והגיליון לא שוחק.');
    if (cw >= ws.from) return mk('watch', 'בדיקת המוכנות הזו פתוחה עכשיו: אתה משחק את הגיליון.');
    return mk('idle', `הבדיקה נפתחת ב-${start}.`);
  }
  if (total > 0 && open === 0) return mk('done', 'כל ה-issues כאן סגורים.');
  if (cw < ws.from) return closed ? mk('early', `השבועות שלה מתחילים ב-${start}, ו-${closed} מתוך ${total} כבר סגורים.`) : mk('idle', `השבועות שלה מתחילים ב-${start}.`);
  if (cw > ws.to) return mk('behind', `השבוע האחרון שלה עבר עם ${open} פתוחים.`);
  if (dayGap(start, today) < 7) return mk('ontrack', 'זה השבוע הראשון שלה; הקצב נמדד מהשבוע הבא.');
  const elapsed = Math.max(0, Math.min(1, dayGap(start, today) / ((ws.to - ws.from + 1) * 7)));
  const expected = elapsed * total;
  const pace = `${closed} נסגרו; הקצב דורש כ-${Math.round(expected)} עד היום.`;
  return closed >= expected ? mk('ontrack', pace) : closed >= expected * 0.6 ? mk('watch', pace) : mk('behind', pace);
}

export interface UnitQuestion {
  id: string;
  title?: string;
  where?: string;
  status: 'green' | 'partial' | 'red' | 'untried';
  failing?: string;
  issue?: number;
}

export interface UnitRow {
  id: string;
  name: string;
  builder: string;
  from: string;
  to: string | null;
  questions: UnitQuestion[];
  green: number;
  partial: number;
  red: number;
  untried: number;
  /** green a week before the newest measure, when the history has one */
  greenWeekAgo: number | null;
  measuredAt: string | null;
  commit: string | null;
}

interface UnitsFile { units: { id: string; name: string; builder: string; from: string; to: string | null; questions: { id: string; title?: string; where?: string }[] }[] }
interface ReadinessFile {
  measuredAt: string;
  commit: string;
  units: Record<string, { questions: { id: string; status: 'green' | 'partial' | 'red' | 'untried'; failing?: string; issue?: number }[] }>;
  history?: { date: string; green: Record<string, number> }[];
}

/**
 * Unit readiness (#2868 Addition A): the unit's questions from the unit map, each with its measured state.
 * A question the measure has not seen is `untried`, never dropped, so the score cannot look complete
 * because the hard questions were never entered.
 */
export function readiness(unitsFile: unknown, readinessFile: unknown): UnitRow[] {
  const u = unitsFile as UnitsFile | null;
  if (!u || !Array.isArray(u.units)) return [];
  const r = readinessFile as ReadinessFile | null;
  return u.units.map((unit) => {
    const measured = new Map((r?.units?.[unit.id]?.questions ?? []).map((q) => [q.id, q]));
    const questions: UnitQuestion[] = unit.questions.map((q) => {
      const m = measured.get(q.id);
      return { id: q.id, title: q.title, where: q.where, status: m?.status ?? 'untried', failing: m?.failing, issue: m?.issue };
    });
    const count = (s: UnitQuestion['status']) => questions.filter((q) => q.status === s).length;
    let greenWeekAgo: number | null = null;
    if (r?.history?.length) {
      const target = new Date(Date.parse(r.measuredAt) - 7 * 864e5).toISOString().slice(0, 10);
      const older = r.history.filter((h) => h.date <= target).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (older && unit.id in older.green) greenWeekAgo = older.green[unit.id];
    }
    return {
      id: unit.id, name: unit.name, builder: unit.builder, from: unit.from, to: unit.to, questions,
      green: count('green'), partial: count('partial'), red: count('red'), untried: count('untried'), greenWeekAgo,
      measuredAt: r?.measuredAt ?? null, commit: r?.commit ?? null,
    };
  });
}

/** The teaching phase of an open issue (the roadmap's rule: most urgent phase wins; the hyperbola is next year). */
export function phaseOf(i: Issue): 'now' | 'next' | 'maint' | 'later' | 'cross' {
  const l = i.labels;
  const conic = /hyperbol|היפרבול/i.test(i.title);
  if (l.includes('analytic') && !conic) return 'now';
  if (l.includes('3d')) return 'next';
  if (l.includes('analytic')) return 'later';
  if (l.includes('2d')) return 'maint';
  if (l.includes('complex')) return 'later';
  return 'cross';
}

export interface Pace {
  plan: Plan | null;
  week: number;
  rows: WsRow[];
  planOpen: number;
  planClosed: number;
  expected: number;
  units: UnitRow[];
  /** Open P1/P2 in the tools being taught now or next that no workstream names and nobody pulled in (ADR-W-165). */
  outside: Issue[];
  pulled: { issue: Issue | null; n: number; week: number; at: string; by: string }[];
}

export function pace(ctx: Ctx): Pace {
  const units = readiness(ctx.s.files.units, ctx.s.files.readiness);
  const plan = ctx.plan;
  if (!plan) return { plan: null, week: 0, rows: [], planOpen: 0, planClosed: 0, expected: 0, units, outside: [], pulled: [] };
  const rows = plan.workstreams.map((w) => wsRow(plan, w, ctx.byN, ctx.today)).sort((a, b) => (a.ws.order ?? 0) - (b.ws.order ?? 0));
  let planOpen = 0, planClosed = 0, expected = 0;
  for (const r of rows) {
    if (r.ws.milestone) continue;
    planOpen += r.open;
    planClosed += r.closed;
    const start = plan.weeks[r.ws.from - 1]?.from ?? plan.start;
    const elapsed = Math.max(0, Math.min(1, dayGap(start, ctx.today) / ((r.ws.to - r.ws.from + 1) * 7)));
    expected += elapsed * (r.open + r.closed);
  }
  const inPlan = new Set([...plan.workstreams.flatMap((w) => w.issues), ...(plan.pulled ?? []).map((p) => p.issue)]);
  const weight = (i: Issue) => (i.labels.includes('P1') ? 4 : 0) + (i.labels.includes('wrong-answer') ? 2 : 0) + (i.labels.includes('reported') ? 1 : 0);
  const outside = ctx.s.open
    .filter((i) => !inPlan.has(i.n) && ['now', 'next'].includes(phaseOf(i)) && (i.labels.includes('P1') || i.labels.includes('P2')))
    .sort((a, b) => weight(b) - weight(a) || b.created.localeCompare(a.created));
  const pulled = (plan.pulled ?? []).map((p) => ({ issue: ctx.byN.get(p.issue) ?? null, n: p.issue, week: p.week, at: p.at, by: p.by }));
  return { plan, week: currentWeek(plan, ctx.today), rows, planOpen, planClosed, expected: Math.round(expected), units, outside, pulled };
}

// ── 4 · What is live? ─────────────────────────────────────────────────────────

export const APP_NAMES: { id: string; he: string; match: RegExp; path: string }[] = [
  { id: '2d', he: 'גאומטריה במישור (2-D)', match: /\b2-D\b/, path: '/geo-builder/' },
  { id: 'analytic', he: 'גאומטריה אנליטית', match: /analytic/i, path: '/analytic-builder/' },
  { id: '3d', he: 'גאומטריה במרחב (3-D)', match: /\b3-D\b/, path: '/3d-builder/' },
  { id: 'complex', he: 'מספרים מרוכבים', match: /complex/i, path: '/complex-builder/' },
  { id: 'proxy', he: 'השרת (proxy)', match: /proxy/i, path: '' },
];

export function live(ctx: Ctx) {
  return {
    live: ctx.s.live,
    perApp: APP_NAMES.map((a) => ({ ...a, last: ctx.s.deploys.find((d) => a.match.test(d.apps)) ?? null })),
    deploys: ctx.s.deploys.slice(0, 12),
  };
}

// ── 5 · What features are we not getting around to? ─────────────────────────

export interface Direction {
  name: string;
  what: string;
  size?: string;
  status?: string;
  issues: number[];
  note?: string;
}

export interface DirectionsFile {
  asOf: string;
  products: { id: string; name: string; stage: string; directions: Direction[]; longTail?: string; outOfScope?: string }[];
  threads?: string;
}

export function backlog(ctx: Ctx) {
  const plan = ctx.plan;
  const inPlan = new Set([...(plan?.workstreams ?? []).flatMap((w) => w.issues), ...(plan?.pulled ?? []).map((p) => p.issue)]);
  const features = ctx.s.open.filter((i) => kindOf(i) === 'feature');
  const byProduct = PRODUCTS.map((p) => ({
    product: p,
    rows: features
      .filter((i) => productOf(i) === p)
      .sort((a, b) => a.created.localeCompare(b.created))
      .map((i) => ({ issue: i, ageDays: dayGap(i.created, ctx.today), inPlan: inPlan.has(i.n), phase: phaseOf(i) })),
  }));
  const later = ctx.s.open.filter((i) => i.labels.includes('later'));
  const d = ctx.s.files.directions as DirectionsFile | null;
  const directions = (d?.products ?? []).map((prod) => ({
    ...prod,
    directions: prod.directions.map((dir) => {
      const states = dir.issues.map((n) => ctx.byN.get(n));
      return {
        ...dir,
        open: states.filter((i) => i?.open).length,
        closed: states.filter((i) => i && !i.open).length + states.filter((i) => !i).length,
      };
    }),
  }));
  return { byProduct, later, parked: ctx.s.parked, directions, directionsAsOf: d?.asOf ?? null, threads: d?.threads ?? null, total: features.length, inPlan: features.filter((i) => inPlan.has(i.n)).length };
}

// ── 7 · What does a change cost? ─────────────────────────────────────────────

/** The round's ledger lines (ADR-W-168, ADR-W-178): the same reading as `scripts/round-metrics.mjs` ledgerLines. */
export function ledger(body: string) {
  const ql = body.match(/queue:\s*(closed=\d+[^\n`]*)/i);
  const o = body.match(/operator:\s*play=(\d+)\s+audits=(\d+)/i);
  const kv: Record<string, number> = ql ? Object.fromEntries([...ql[1].matchAll(/([a-z-]+)=(\d+)/gi)].map((m) => [m[1].toLowerCase(), +m[2]])) : {};
  const num = (k: string) => (kv[k] == null ? null : kv[k]);
  return {
    queue: ql ? { closed: num('closed'), filed: num('filed'), filedOpen: num('filed-open'), foundInRound: num('found-in-round'), onMain: num('on-main'), onApproval: num('on-approval') } : null,
    operator: o ? { play: +o[1], audit: +o[2] } : null,
  };
}

export function cost(ctx: Ctx) {
  return ctx.s.rounds.map((r) => {
    const end = r.closed ?? ctx.s.asOf;
    const l = ledger(r.body);
    const minutes = l.operator ? l.operator.play * 3 + l.operator.audit : null;
    return {
      issue: r,
      date: day(r.created),
      hours: Math.round(((Date.parse(end) - Date.parse(r.created)) / 36e5) * 10) / 10,
      running: r.open,
      ...l,
      minutes,
    };
  });
}
