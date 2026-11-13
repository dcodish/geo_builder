/**
 * Section 6 · usage, and what real users failed at this week (#2868 Addition B, ADR-W-209).
 *
 * Reads the event logs the server already owns, through the dashboards' own classifiers (one reading of an
 * event per builder, never a copy). A line "failed" when the builder did not understand it or the AI had to
 * build it. Version 1 groups by the normalized line and its outcome; grouping by what the student meant stays
 * with the log-triage session. The operator's own devices are separated by visitor hash.
 */
import { PROFILE_2D, PROFILE_3D, PROFILE_ANALYTIC, outcomeOfComplex, verdictOf, VERDICT_FIXED, type VerdictMap } from '../admin';
import type { UsageEvent } from '../eventLog';
import type { Issue } from './snapshot';

export interface Builder {
  id: string;
  he: string;
  classify: (e: UsageEvent) => string;
  /** The admin dashboard's public base, for the session timeline link; null when the builder has none. */
  admin: string | null;
}

export const BUILDERS: Builder[] = [
  { id: 'analytic', he: 'גאומטריה אנליטית', classify: PROFILE_ANALYTIC.classify, admin: '/analytic-builder/admin' },
  { id: '3d', he: 'גאומטריה במרחב (3-D)', classify: PROFILE_3D.classify, admin: '/3d-builder/admin' },
  { id: '2d', he: 'גאומטריה במישור (2-D)', classify: PROFILE_2D.classify, admin: '/geo-builder/admin' },
  { id: 'complex', he: 'מספרים מרוכבים', classify: outcomeOfComplex, admin: null },
];

/** The outcomes that count as a failure this week: not understood, or built only by the AI. */
export const FAILED = new Set(['not-understood', 'llm-built']);
export const FAILED_LABEL: Record<string, string> = { 'not-understood': 'לא הובן', 'llm-built': 'נבנה רק ע״י ה-AI' };

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface FailGroup {
  line: string;
  outcome: string;
  count: number;
  sessions: string[];
  lastSeen: string;
  /** the verdict map's reading on current code; null when the map has no row (or no map) */
  verdict: string | null;
  stillFails: boolean | null;
  issue: Issue | null;
}

export interface BuilderUsage {
  builder: Builder;
  hasLog: boolean;
  week: { visitors: number; sessions: number; submits: number; failed: number };
  prevWeek: { visitors: number; sessions: number; submits: number; failed: number };
  mine: { sessions: number; submits: number };
  groups: FailGroup[];
  verdictsAge: string | null;
}

/**
 * Match a failed line to an issue: the issue title carries the student's words (triage files them so),
 * so an open or parked issue whose title contains the normalized line covers it. Lines under 4 characters
 * match nothing.
 */
export function issueFor(line: string, issues: Issue[]): Issue | null {
  const l = norm(line);
  if (l.length < 4) return null;
  return issues.find((i) => i.open && norm(i.title).includes(l)) ?? issues.find((i) => norm(i.title).includes(l)) ?? null;
}

export function builderUsage(
  b: Builder,
  events: UsageEvent[] | null,
  vm: VerdictMap | null,
  issues: Issue[],
  mine: Set<string>,
  now: Date,
  days = 7,
): BuilderUsage {
  const t0 = new Date(now.getTime() - days * 864e5).toISOString();
  const tPrev = new Date(now.getTime() - 2 * days * 864e5).toISOString();
  const empty = { visitors: 0, sessions: 0, submits: 0, failed: 0 };
  if (!events) return { builder: b, hasLog: false, week: empty, prevWeek: empty, mine: { sessions: 0, submits: 0 }, groups: [], verdictsAge: vm?.generatedAt ?? null };
  const stats = (from: string, to: string) => {
    const evs = events.filter((e) => e.serverTs >= from && e.serverTs < to && !mine.has(e.iph));
    const subs = evs.filter((e) => e.ev === 'submit');
    return {
      visitors: new Set(evs.map((e) => e.iph)).size,
      sessions: new Set(evs.map((e) => e.sid).filter(Boolean)).size,
      submits: subs.length,
      failed: subs.filter((e) => FAILED.has(b.classify(e))).length,
    };
  };
  const end = now.toISOString();
  const myEvs = events.filter((e) => e.serverTs >= t0 && mine.has(e.iph));
  const groups = new Map<string, FailGroup>();
  for (const e of events) {
    if (e.ev !== 'submit' || e.serverTs < t0 || mine.has(e.iph) || !e.utterance) continue;
    const outcome = b.classify(e);
    if (!FAILED.has(outcome)) continue;
    const line = norm(e.utterance);
    const key = `${outcome}\u0000${line}`;
    const g = groups.get(key) ?? { line, outcome, count: 0, sessions: [], lastSeen: '', verdict: null, stillFails: null, issue: null };
    g.count++;
    if (e.sid && !g.sessions.includes(e.sid)) g.sessions.push(e.sid);
    if (e.serverTs > g.lastSeen) g.lastSeen = e.serverTs;
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    g.verdict = verdictOf(vm, g.line);
    g.stillFails = g.verdict == null ? null : !VERDICT_FIXED.has(g.verdict);
    g.issue = issueFor(g.line, issues);
  }
  return {
    builder: b,
    hasLog: true,
    week: stats(t0, end),
    prevWeek: stats(tPrev, t0),
    mine: { sessions: new Set(myEvs.map((e) => e.sid).filter(Boolean)).size, submits: myEvs.filter((e) => e.ev === 'submit').length },
    groups: [...groups.values()].sort((a, b) => b.sessions.length - a.sessions.length || b.count - a.count || b.lastSeen.localeCompare(a.lastSeen)),
    verdictsAge: vm?.generatedAt ?? null,
  };
}
