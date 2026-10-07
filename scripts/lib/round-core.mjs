/**
 * #1853 (ADR-W-115) — the LIVE ROUND DASHBOARD (tracking only), pure half: the event vocabulary, its validation, and
 * the fold from an append-only event log to the one state document the dashboard page renders.
 * Tracking only (operator ruling 2026-10-07): the end-of-round report and play sheet stay their own page.
 *
 * WHY A LOG AND A FOLD: only a Claude session can write the page's database, but a round's item agents
 * run in the background in their own worktrees. So every actor APPENDS one line per phase change to a
 * log in the git common dir (`scripts/round-event.mjs emit`), and the orchestrator pushes `fold(log)`
 * to the page whenever it wakes. The log is the record; the page is a projection of it, and is never
 * the only copy of anything.
 *
 * No I/O here — the CLI owns the files, so `server/__tests__/round-events.test.ts` holds the fold
 * directly.
 */

/** A round's pipeline, in order. The dashboard's stepper is exactly this list. */
export const ROUND_PHASES = [
  { id: 'compose', he: 'הרכבה' },
  { id: 'execute', he: 'תיקון' },
  { id: 'batch', he: 'בדיקת אצווה' },
  { id: 'land', he: 'הטמעה' },
  { id: 'playsheet', he: 'דף בדיקה' },
  { id: 'awaiting-play', he: 'ממתין לך' },
];

/**
 * An item's phases. The first five are the item's own work; the rest are where it ends. `ready`
 * means its own gates are green and it waits for the batch (a bug) — it is not yet on `main`.
 */
export const ITEM_PHASES = [
  { id: 'queued', he: 'בתור' },
  { id: 'remeasure', he: 'מדידה מחדש' },
  { id: 'fixing', he: 'בתיקון' },
  { id: 'gates', he: 'בדיקות' },
  { id: 'ready', he: 'מוכן לאצווה' },
  { id: 'landed', he: 'ב-main', terminal: true },
  { id: 'pr', he: 'PR פתוח', terminal: true },
  { id: 'escalated', he: 'הועבר אליך', terminal: true },
  { id: 'skipped', he: 'דולג', terminal: true },
  { id: 'closed', he: 'כבר תוקן', terminal: true },
];

const ROUND_IDS = new Set(ROUND_PHASES.map((p) => p.id));
const ITEM_IDS = new Set(ITEM_PHASES.map((p) => p.id));
const TERMINAL = new Set(ITEM_PHASES.filter((p) => p.terminal).map((p) => p.id));
/** An item key: the issue number, or issue numbers joined by `+` for a bundle (`1801+1802`). */
const ITEM_KEY = /^\d+(\+\d+)*$/;
/** The item fields a `data` payload may set. Anything else is refused at emit time, never folded. */
const ITEM_FIELDS = ['title', 'about', 'plan', 'route', 'stream', 'issues', 'sha', 'pr', 'adrs', 'deviations', 'branch'];
/** `reportUrl` is the end-of-round report page (fix-round Step 5b), which the dashboard only links to. */
const ROUND_FIELDS = ['title', 'issueUrl', 'reportUrl'];

/**
 * Refuses an event the fold could not place. Returns the problems (empty = valid). Called by the CLI
 * BEFORE the line is written, so a typo'd phase fails the agent's command instead of silently
 * vanishing from the page.
 */
export function validateEvent(ev) {
  const p = [];
  if (!ev || typeof ev !== 'object') return ['not an object'];
  if (typeof ev.t !== 'string' || Number.isNaN(Date.parse(ev.t))) p.push('t must be an ISO time');
  if (ev.kind === 'round') {
    if (!ROUND_IDS.has(ev.phase)) p.push(`unknown round phase «${ev.phase}» — one of ${[...ROUND_IDS].join(', ')}`);
    p.push(...unknownFields(ev.data, ROUND_FIELDS));
  } else if (ev.kind === 'item') {
    if (!ITEM_KEY.test(String(ev.item ?? ''))) p.push(`item key «${ev.item}» must be an issue number or N+M for a bundle`);
    if (!ITEM_IDS.has(ev.phase)) p.push(`unknown item phase «${ev.phase}» — one of ${[...ITEM_IDS].join(', ')}`);
    p.push(...unknownFields(ev.data, ITEM_FIELDS));
    if (ev.data?.route !== undefined && !['bug', 'feature'].includes(ev.data.route)) p.push('route must be bug or feature');
  } else if (ev.kind === 'note') {
    if (typeof ev.note !== 'string' || !ev.note) p.push('a note event carries a note');
  } else {
    p.push(`unknown kind «${ev.kind}» — round, item or note`);
  }
  return p;
}

const unknownFields = (data, allowed) =>
  data && typeof data === 'object' ? Object.keys(data).filter((k) => !allowed.includes(k)).map((k) => `unknown data field «${k}»`) : [];

/** Parses a log's text; a torn or foreign line is COUNTED, never thrown on — the page must still draw. */
export function parseLog(text) {
  const events = [];
  let rejected = 0;
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (validateEvent(ev).length) rejected++;
      else events.push(ev);
    } catch {
      rejected++;
    }
  }
  return { events, rejected };
}

/** How many recent events the page's activity feed carries — the log itself keeps everything. */
export const FEED_LENGTH = 40;

/**
 * The fold: events (in log order) → the dashboard's state document. Pure and total. Item order is
 * the order items were first named (the composition order); a later event never reorders them.
 */
export function fold(events, { round, rejected = 0 } = {}) {
  const state = {
    round: round ?? null,
    title: null,
    issueUrl: null,
    reportUrl: null,
    phase: null,
    phases: ROUND_PHASES.map((p) => ({ id: p.id, he: p.he, at: null })),
    items: [],
    feed: [],
    startedAt: null,
    updatedAt: null,
    rejected,
  };
  const byKey = new Map();
  const itemOf = (key) => {
    let it = byKey.get(key);
    if (!it) {
      it = {
        key,
        issues: key.split('+').map(Number),
        title: null, about: null, plan: null, route: null, stream: null,
        sha: null, pr: null, adrs: [], deviations: null, branch: null,
        phase: 'queued', since: null, timeline: [],
      };
      byKey.set(key, it);
      state.items.push(it);
    }
    return it;
  };

  for (const ev of events) {
    state.startedAt ??= ev.t;
    state.updatedAt = ev.t;
    if (ev.kind === 'round') {
      Object.assign(state, pick(ev.data, ROUND_FIELDS));
      state.phase = ev.phase;
      // Reaching a phase marks it and fills any earlier phase the round passed without announcing.
      const idx = ROUND_PHASES.findIndex((p) => p.id === ev.phase);
      state.phases.forEach((p, i) => {
        if (i < idx) p.at ??= ev.t;
      });
      state.phases[idx].at = ev.t;
      state.phases.forEach((p, i) => {
        if (i > idx) p.at = null; // a round can step back (a red batch reopens execute)
      });
    } else if (ev.kind === 'item') {
      const it = itemOf(String(ev.item));
      Object.assign(it, pick(ev.data, ITEM_FIELDS));
      if (it.phase !== ev.phase || it.since === null) it.since = ev.t;
      it.phase = ev.phase;
      it.timeline.push({ t: ev.t, phase: ev.phase, note: ev.note ?? null });
    }
    state.feed.push({ t: ev.t, kind: ev.kind, item: ev.item ?? null, phase: ev.phase ?? null, note: ev.note ?? null });
  }
  state.feed = state.feed.slice(-FEED_LENGTH).reverse();
  state.counts = counts(state.items);
  return state;
}

const pick = (data, keys) =>
  Object.fromEntries(Object.entries(data ?? {}).filter(([k, v]) => keys.includes(k) && v !== undefined));

/** Per-phase item counts, plus `done` (terminal) and `total` — the dashboard's progress bar. */
export function counts(items) {
  const c = Object.fromEntries(ITEM_PHASES.map((p) => [p.id, 0]));
  for (const it of items) c[it.phase]++;
  c.total = items.length;
  c.done = items.filter((it) => TERMINAL.has(it.phase)).length;
  return c;
}

/**
 * The fix-round `stats:` line, derived from the same fold the page shows — so the ledger's machine
 * line and the dashboard can never disagree. `ready` items at finalize time were never landed and
 * are reported as skipped by the round, which emits that phase itself.
 */
export function statsLine(state) {
  const c = state.counts ?? counts(state.items);
  return `stats: picked=${c.total} landed=${c.landed} prs=${c.pr} escalated=${c.escalated} skipped=${c.skipped + c.closed}`;
}
