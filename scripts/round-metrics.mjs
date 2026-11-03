#!/usr/bin/env node
/**
 * round-metrics — what did each fix round change on main, what waits for the operator's approval, and
 * what did it cost him? (#2654 idea 1, [ADR-W-169](../docs/06w-decisions-workspace.md#adr-w-169);
 * the headline split is #2675, [ADR-W-178](../docs/06w-decisions-workspace.md#adr-w-178))
 *
 * Operator, 2026-11-01: *"if the ratio was not reasonable, something is completely wrong with this
 * methodology."* Operator, 2026-11-03 (card d7 A): the headline counts only changes landed on main, and
 * *"I want to also know how many issues will be closed if all tests are approved."* Round #2665 reported
 * "17 closed"; 14 were parks and 2 were already fixed.
 *
 *   node scripts/round-metrics.mjs <out-dir> [--since 2026-10-01]
 *     Writes <out-dir>/rounds.json — the roadmap page's db doc `history/rounds`.
 *   node scripts/round-metrics.mjs --headline <R> [--found N] [--table 12,34]
 *     Prints round R's Step-5 headline lines and its `queue:` ledger line, measured from GitHub now.
 *     `--found` is the found-in-round count (GitHub cannot see it); `--table` names the items closed
 *     into the parity table (ADR-W-170), which GitHub cannot tell from a merge.
 *
 * Per round (the issue titled `fix-round …`):
 *   onMain     — HEADLINE: its items closed *completed* by a commit or merged PR during the round
 *                (the window opens 6 h before the round issue, for what it did while composing)
 *   onApproval — the issues its open PRs close: what closes once he plays the 🎮 cases and the PRs pass
 *   housekeeping — closed without a change on main: merged into a family, parked (`icebox`), closed into
 *                the parity table, or already fixed at re-measure. Its own line, never the headline.
 *   closed     — every item closed (onMain + housekeeping), by the end of the day after the round closed
 *   filed      — issues opened during the round whose body names the round (`round #R`): found work
 *   net        — filed − closed, SECONDARY. Negative shrinks the queue; zero or more is FLAGGED.
 *   operator cases and ≈ minutes — from the round's play sheet `scripts/playsheets/round-<R>.json`.
 * A round that wrote the ledger line `queue: closed=N filed=N filed-open=N found-in-round=N` (ADR-W-168),
 * since ADR-W-178 followed by `on-main=N on-approval=N merged=N parked=N table=N already-fixed=N`, and
 * `operator: play=N audits=N`, is read from it (`source: "ledger"`); an older one is estimated from its
 * composition section and the GitHub record (`source: "estimate"`). A ledger line without the new fields
 * still reads: its headline is estimated (`headlineSource: "estimate"`).
 *
 * Reads GitHub through REST only (`gh api`), page by page, so the daily cloud routine can run it.
 */
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

/** Minutes per case, an estimate shown as one: a 🎮 case is played, a 👁 or audit looked at, a ✅ read. */
export const MINUTES = { play: 3, look: 1, verified: 0.5, audit: 1 };
/** Rounds closed under ADR-W-168 send him only 🎮 and the spot audits; before it, every case. */
export const RULES_FROM = '2026-11-01';
/** Parks and re-measure closes happen while the round composes, before its issue exists: the window opens this early. */
export const COMPOSE_LEAD_MS = 6 * 36e5;
/** A keyword close on a push or merge lands within seconds of the commit's reference event. */
export const CLOSER_SKEW_MS = 60e3;
/** The housekeeping kinds, in the ledger line's order (ADR-W-178). */
export const HOUSEKEEPING = ['merged', 'parked', 'table', 'already-fixed'];

/**
 * The issues a round composed: the `#N` in its composition, from the top of the body to the first
 * "Not picked", "Ledger", "Report" or "Heads-up" heading. PR numbers (`PR #N`) and the round itself are
 * not items.
 */
export function composedItems(body, round) {
  const text = String(body || '');
  const end = text.search(/^#{2,3}\s*(Not picked|Ledger|Report|Heads-up|Skipped)/im);
  const head = end >= 0 ? text.slice(0, end) : text;
  const out = new Set();
  for (const m of head.matchAll(/(PR\s*)?#(\d{2,5})\b/g)) if (!m[1] && +m[2] !== round) out.add(+m[2]);
  return [...out];
}

/** The PRs a round names (`PR #N`), anywhere in its body. */
export function roundPrs(body) {
  return [...new Set([...String(body || '').matchAll(/PR\s*#(\d{2,5})\b/gi)].map((m) => +m[1]))];
}

/** The issues a PR body closes with a GitHub keyword (`Closes #N`, `Fixes #N`, `Resolves #N`). */
export function prCloses(body) {
  return [...new Set([...String(body || '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d{2,5})\b/gi)].map((m) => +m[1]))];
}

/**
 * The ledger lines, when the round wrote them. The `queue:` line is read as key=value pairs after its
 * leading `closed=`, so the ADR-W-168 line still reads and the ADR-W-178 fields are optional (null when
 * absent).
 */
export function ledgerLines(body) {
  const text = String(body || '');
  const ql = text.match(/queue:\s*(closed=\d+[^\n`]*)/i);
  const o = text.match(/operator:\s*play=(\d+)\s+audits=(\d+)/i);
  let queue = null;
  if (ql) {
    const kv = Object.fromEntries([...ql[1].matchAll(/([a-z-]+)=(\d+)/gi)].map((m) => [m[1].toLowerCase(), +m[2]]));
    const num = (k) => (kv[k] == null ? null : kv[k]);
    if (kv.filed != null && kv['filed-open'] != null) {
      const hasHousekeeping = HOUSEKEEPING.some((k) => kv[k] != null);
      queue = {
        closed: kv.closed, filed: kv.filed, filedOpen: kv['filed-open'], foundInRound: num('found-in-round'),
        onMain: num('on-main'), onApproval: num('on-approval'),
        housekeeping: hasHousekeeping ? housekeepingOf({ merged: num('merged') || 0, parked: num('parked') || 0, table: num('table') || 0, alreadyFixed: num('already-fixed') || 0 }) : null,
      };
    }
  }
  return { queue, operator: o ? { play: +o[1], audit: +o[2] } : null };
}

function housekeepingOf(h) {
  return { ...h, total: h.merged + h.parked + h.table + h.alreadyFixed };
}

/**
 * What one item's close was (ADR-W-178). `s` = {closed, closedAt, reason, labels[], byCommit, onApproval,
 * table}; `win` = [from, to] ISO. Returns `on-main` (closed completed by a commit or merged PR), a
 * housekeeping kind, `on-approval` (open, and an open PR closes it), `open`, or `outside` (closed outside
 * the window: not this round's doing).
 */
export function closeKind(s, win) {
  if (!s) return 'open';
  if (!s.closed) return s.onApproval ? 'on-approval' : 'open';
  if (win && (s.closedAt < win[0] || s.closedAt > win[1])) return 'outside';
  if ((s.labels || []).includes('icebox')) return 'parked';
  if (s.table) return 'table';
  if (/^(not[_ ]planned|duplicate)$/i.test(s.reason || '')) return 'merged';
  return s.byCommit ? 'on-main' : 'already-fixed';
}

/**
 * Was the issue's LAST close made by a commit or a merged PR? `timeline` = its REST timeline events. A
 * commit close carries `commit_id` on the closed event; a PR merge leaves it null but references the merge
 * commit in the same second. A lock commit that only NAMES an issue someone closed by hand (already fixed
 * at re-measure) is minutes away, so it is not the closer.
 */
export function closedByCommit(timeline) {
  const ev = timeline || [];
  const last = ev.filter((e) => e.event === 'closed').at(-1);
  if (!last) return false;
  if (last.commit_id) return true;
  const t = Date.parse(last.created_at);
  return ev.some((e) => e.event === 'referenced' && e.commit_id && Math.abs(Date.parse(e.created_at) - t) <= CLOSER_SKEW_MS);
}

/** Counts the kinds of a round's items into the headline's three numbers. */
export function tally(kinds) {
  const n = (k) => kinds.filter((x) => x === k).length;
  const housekeeping = housekeepingOf({ merged: n('merged'), parked: n('parked'), table: n('table'), alreadyFixed: n('already-fixed') });
  return { onMain: n('on-main'), onApproval: n('on-approval'), housekeeping, closed: n('on-main') + housekeeping.total };
}

/** The `queue:` ledger line (ADR-W-168's fields first, unchanged, then ADR-W-178's). */
export function queueLine(q) {
  const h = q.housekeeping;
  return `queue: closed=${q.closed} filed=${q.filed} filed-open=${q.filedOpen} found-in-round=${q.foundInRound ?? 0} ` +
    `on-main=${q.onMain} on-approval=${q.onApproval} merged=${h.merged} parked=${h.parked} table=${h.table} already-fixed=${h.alreadyFixed}`;
}

/**
 * The round report's Step-5 headline, in his order: changes on main first, then what closes on his
 * approval, then housekeeping on its own line, then the net as a secondary number. `lists` optionally
 * carries the issue numbers per kind (`{'on-main': [..], 'on-approval': [..], prs: [..]}`).
 */
export function headlineLines(q, lists = {}) {
  const ns = (k) => (lists[k]?.length ? ` — ${lists[k].map((n) => `#${n}`).join(' ')}` : '');
  const h = q.housekeeping;
  const net = q.filed - q.closed;
  return [
    `**Changes on main: ${q.onMain}**${ns('on-main')}`,
    `**Will close on your approval: ${q.onApproval}**${ns('on-approval')}${lists.prs?.length ? ` (${lists.prs.map((n) => `PR #${n}`).join(', ')})` : ''}`,
    `Housekeeping: ${h.total} — merged ${h.merged} · parked ${h.parked} · parity table ${h.table} · already fixed ${h.alreadyFixed}`,
    `Net (filed − closed): ${net > 0 ? '+' : ''}${net} · filed ${q.filed}, ${q.filedOpen} still open · closed ${q.closed}`,
  ];
}

/** Cases by class in a play sheet: the cases he handled. */
export function sheetCases(sheet) {
  const c = { play: 0, look: 0, verified: 0 };
  for (const x of sheet?.cases || []) if (x.class in c) c[x.class]++;
  return c;
}

/**
 * One round's row. `round` = {n, title, created, closed, body}; `stateOf(n)` = {closed, closedAt, reason,
 * labels} of an issue; `opened` = every issue opened in the window, {n, created, body, open}; `sheet` = the
 * play sheet; `byCommitOf(n)` = whether the issue's last close was a commit or merged PR (optional: the
 * headline estimate needs it, and is null without it).
 */
export function roundRow(round, stateOf, opened, sheet, byCommitOf) {
  const end = round.closed || new Date().toISOString();
  const grace = new Date(Date.parse(end) + 864e5).toISOString();
  const win = [new Date(Date.parse(round.created) - COMPOSE_LEAD_MS).toISOString(), grace];
  const { queue, operator } = ledgerLines(round.body);
  const items = composedItems(round.body, round.n);
  const mention = new RegExp(`round\\s*#${round.n}\\b`, 'i');
  const filedList = opened.filter((i) => i.n !== round.n && i.created >= round.created && i.created <= grace && mention.test(i.body || ''));
  const row = {
    n: round.n,
    title: round.title.replace(/^fix-round\s*/i, ''),
    date: round.created.slice(0, 10),
    hours: Math.round(((Date.parse(end) - Date.parse(round.created)) / 36e5) * 10) / 10,
    running: !round.closed,
    named: items.length, // issues the composition names: an upper bound on its items, not a count of them
    source: queue ? 'ledger' : 'estimate',
  };
  if (queue) Object.assign(row, { closed: queue.closed, filed: queue.filed, filedOpen: queue.filedOpen, foundInRound: queue.foundInRound });
  else {
    row.closed = items.filter((n) => { const s = stateOf(n); return s && s.closed && s.closedAt >= win[0] && s.closedAt <= win[1]; }).length;
    row.filed = filedList.length;
    row.filedOpen = filedList.filter((i) => i.open).length;
    row.foundInRound = null;
  }
  // The headline (ADR-W-178): from the ledger when the round wrote it, else estimated from each item's close.
  if (queue && queue.onMain != null && queue.housekeeping) {
    Object.assign(row, { onMain: queue.onMain, onApproval: queue.onApproval, housekeeping: queue.housekeeping, headlineSource: 'ledger' });
  } else if (byCommitOf) {
    const kinds = items.map((n) => {
      const s = stateOf(n);
      if (!s) return 'open';
      // Only a completed close inside the window needs its closer (one timeline read per item).
      const asks = s.closed && s.closedAt >= win[0] && s.closedAt <= win[1] && !/^(not[_ ]planned|duplicate)$/i.test(s.reason || '') && !(s.labels || []).includes('icebox');
      return closeKind({ ...s, byCommit: asks && byCommitOf(n) }, win);
    });
    const t = tally(kinds);
    // A closed round's open PRs are no longer what it hands him; only a running round is measured for it.
    Object.assign(row, { onMain: t.onMain, onApproval: null, housekeeping: t.housekeeping, headlineSource: 'estimate' });
  } else Object.assign(row, { onMain: null, onApproval: null, housekeeping: null, headlineSource: null });
  row.net = row.filed - row.closed;
  row.flag = !row.running && row.net >= 0;
  const cases = sheetCases(sheet);
  const after = row.date >= RULES_FROM;
  const op = operator || (after ? { play: cases.play, audit: 0 } : null);
  row.operator = op ? { play: op.play, look: 0, verified: 0, audit: op.audit } : { ...cases, audit: 0 };
  row.minutes = Math.round(row.operator.play * MINUTES.play + row.operator.look * MINUTES.look + row.operator.verified * MINUTES.verified + row.operator.audit * MINUTES.audit);
  row.hasSheet = !!sheet;
  return row;
}

const REPO = 'dcodish/geo_builder';
const gh = (p) => JSON.parse(execFileSync('gh', ['api', p], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));

/** Issue `n`'s REST timeline, page by page. */
function timelineOf(n) {
  const out = [];
  for (let page = 1; ; page++) {
    let rows;
    try { rows = gh(`repos/${REPO}/issues/${n}/timeline?per_page=100&page=${page}`); } catch { break; }
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

const ghAsync = promisify(execFile);
/** The closers of many issues at once, eight timelines in flight: one by one, a refresh took ~6 minutes. */
async function closersOf(ns) {
  const out = new Map();
  const queue = [...ns];
  const worker = async () => {
    for (let n = queue.shift(); n != null; n = queue.shift()) {
      const ev = [];
      for (let page = 1; ; page++) {
        let rows;
        try { rows = JSON.parse((await ghAsync('gh', ['api', `repos/${REPO}/issues/${n}/timeline?per_page=100&page=${page}`], { maxBuffer: 64 * 1024 * 1024 })).stdout); } catch { break; }
        ev.push(...rows);
        if (rows.length < 100) break;
      }
      out.set(n, closedByCommit(ev));
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}

/** Issues opened since `since`, newest first; pages by number (`--paginate` follows links the cloud proxy refuses, ADR-W-159). */
function issuesSince(since) {
  const all = [];
  for (let page = 1; ; page++) {
    const rows = gh(`repos/${REPO}/issues?state=all&sort=created&direction=desc&per_page=100&page=${page}`);
    for (const i of rows) if (!i.pull_request) all.push(i);
    if (rows.length < 100 || rows.at(-1).created_at.slice(0, 10) < since) break;
  }
  return all;
}

const stateFrom = (i) => ({ closed: i.state === 'closed', closedAt: i.closed_at || '', reason: i.state_reason || '', labels: (i.labels || []).map((l) => l.name) });

/** `--headline <R>`: round R's Step-5 lines, measured now. */
function headline(args) {
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const r = +val('--headline');
  const round = gh(`repos/${REPO}/issues/${r}`);
  const items = composedItems(round.body, r);
  const table = new Set(String(val('--table') || '').split(',').filter(Boolean).map(Number));
  const open = [];
  for (let page = 1; ; page++) {
    const rows = gh(`repos/${REPO}/pulls?state=open&per_page=100&page=${page}`);
    open.push(...rows);
    if (rows.length < 100) break;
  }
  const named = new Set(roundPrs(round.body));
  const mention = new RegExp(`round\\s*#${r}\\b`, 'i');
  const prs = open.filter((p) => named.has(p.number) || mention.test(p.body || ''));
  const approval = new Map();
  for (const p of prs) for (const n of prCloses(p.body)) approval.set(n, p.number);
  const grace = new Date(Date.parse(round.closed_at || new Date().toISOString()) + 864e5).toISOString();
  const win = [new Date(Date.parse(round.created_at) - COMPOSE_LEAD_MS).toISOString(), grace];
  const kinds = new Map();
  for (const n of new Set([...items, ...approval.keys()])) {
    let i;
    try { i = gh(`repos/${REPO}/issues/${n}`); } catch { continue; }
    const s = stateFrom(i);
    const k = closeKind({ ...s, table: table.has(n), onApproval: approval.has(n), byCommit: s.closed && closedByCommit(timelineOf(n)) }, win);
    kinds.set(n, k);
  }
  const t = tally([...kinds.values()]);
  const filedList = issuesSince(round.created_at.slice(0, 10)).filter((i) => i.number !== r && i.created_at >= round.created_at && mention.test(i.body || ''));
  const prior = ledgerLines(round.body).queue;
  const found = val('--found') != null ? +val('--found') : prior?.foundInRound ?? 0;
  const q = { ...t, filed: filedList.length, filedOpen: filedList.filter((i) => i.state === 'open').length, foundInRound: found };
  const of = (k) => [...kinds].filter(([, v]) => v === k).map(([n]) => n).sort((a, b) => a - b);
  for (const l of headlineLines(q, { 'on-main': of('on-main'), 'on-approval': of('on-approval'), prs: [...new Set(of('on-approval').map((n) => approval.get(n)))] })) console.log(l);
  console.log('');
  console.log(queueLine(q));
  if (table.size === 0 && t.housekeeping.merged) console.log(`(a parity-table close counts as merged unless named with --table)`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--headline')) return headline(args);
  const outDir = args.find((a) => !a.startsWith('--'));
  if (!outDir) { console.error('usage: node scripts/round-metrics.mjs <out-dir> [--since YYYY-MM-DD] | --headline <R> [--found N] [--table 12,34]'); process.exit(1); }
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : '2026-10-01';
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

  const all = issuesSince(since);
  const byNumber = new Map(all.map((i) => [i.number, i]));
  const stateOf = (n) => {
    if (!byNumber.has(n)) { try { byNumber.set(n, gh(`repos/${REPO}/issues/${n}`)); } catch { return null; } }
    return stateFrom(byNumber.get(n));
  };
  const opened = all.map((i) => ({ n: i.number, created: i.created_at, body: i.body || '', open: i.state === 'open' }));
  const rounds = all
    .filter((i) => /^fix-round\s/i.test(i.title) && i.created_at.slice(0, 10) >= since)
    .map((i) => ({ n: i.number, title: i.title, created: i.created_at, closed: i.closed_at, body: i.body || '' }))
    .sort((a, b) => a.created.localeCompare(b.created));
  const sheetOf = (r) => {
    const f = path.join(root, 'scripts', 'playsheets', `round-${r.n}.json`);
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  };
  // Pass 1 learns which items need their closer; their timelines are then read in parallel; pass 2 is the row.
  const wanted = new Set();
  for (const r of rounds) roundRow(r, stateOf, opened, null, (n) => (wanted.add(n), false));
  const closers = await closersOf(wanted);
  const rows = rounds.map((r) => roundRow(r, stateOf, opened, sheetOf(r), (n) => closers.get(n) === true));
  mkdirSync(outDir, { recursive: true });
  const doc = { asOf: new Date().toISOString().slice(0, 10), since, minutesPerCase: MINUTES, rulesFrom: RULES_FROM, rounds: rows };
  writeFileSync(path.join(outDir, 'rounds.json'), JSON.stringify(doc, null, 1));
  const done = rows.filter((r) => !r.running);
  const sum = (k) => done.reduce((a, r) => a + (r[k] ?? 0), 0);
  const hk = done.reduce((a, r) => a + (r.housekeeping?.total ?? 0), 0);
  console.log(`${rows.length} rounds since ${since}: on main ${sum('onMain')}, housekeeping ${hk}; closed ${sum('closed')}, filed ${sum('filed')}, net ${sum('net') > 0 ? '+' : ''}${sum('net')}; ${done.filter((r) => r.flag).length} did not shrink the queue`);
  for (const r of rows) {
    const h = r.housekeeping;
    const head = r.onMain == null ? 'on main ?' : `on main ${r.onMain}${r.onApproval == null ? '' : ` · on approval ${r.onApproval}`} · housekeeping ${h.total} (merged ${h.merged}, parked ${h.parked}, table ${h.table}, already fixed ${h.alreadyFixed})`;
    console.log(`  #${r.n} ${r.date} named ${r.named} ${head} · closed ${r.closed} filed ${r.filed} net ${r.net}${r.flag ? ' ⚑' : ''} · operator ${r.operator.play}🎮 ${r.operator.look}👁 ${r.operator.verified}✅ ≈${r.minutes} min [${r.source}${r.headlineSource && r.headlineSource !== r.source ? `, headline ${r.headlineSource}` : ''}${r.hasSheet ? '' : ', no sheet'}]`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
