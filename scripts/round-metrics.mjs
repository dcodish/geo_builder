#!/usr/bin/env node
/**
 * round-metrics — does each fix round shrink the queue, and what did it cost the operator?
 * (#2654 idea 1, [ADR-W-169](../docs/06w-decisions-workspace.md#adr-w-169))
 *
 * Operator, 2026-11-01: *"if the ratio was not reasonable, something is completely wrong with this
 * methodology."* The six rounds of 24 Oct – 1 Nov closed 52 issues and filed 47. This makes that number a
 * standing measurement instead of a one-off question: one row per round, on the roadmap page.
 *
 *   node scripts/round-metrics.mjs <out-dir> [--since 2026-10-01]
 *     Writes <out-dir>/rounds.json — the roadmap page's db doc `history/rounds`.
 *
 * Per round (the issue titled `fix-round …`):
 *   closed  — its items that were closed by the end of the day after the round closed
 *   filed   — issues opened during the round whose body names the round (`round #R`): found work
 *   net     — filed − closed. Negative shrinks the queue; zero or more is FLAGGED.
 *   operator cases and ≈ minutes — from the round's play sheet `scripts/playsheets/round-<R>.json`.
 * A round that wrote the ADR-W-168 ledger line `queue: closed=N filed=N filed-open=N found-in-round=N`
 * (and `operator: play=N audits=N`) is read from it (`source: "ledger"`); an older one is estimated from its
 * composition section and the GitHub record (`source: "estimate"`).
 *
 * Reads GitHub through REST only (`gh api`), page by page, so the daily cloud routine can run it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** Minutes per case, an estimate shown as one: a 🎮 case is played, a 👁 or audit looked at, a ✅ read. */
export const MINUTES = { play: 3, look: 1, verified: 0.5, audit: 1 };
/** Rounds closed under ADR-W-168 send him only 🎮 and the spot audits; before it, every case. */
export const RULES_FROM = '2026-11-01';

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

/** The ADR-W-168 ledger lines, when the round wrote them. */
export function ledgerLines(body) {
  const q = String(body || '').match(/queue:\s*closed=(\d+)\s+filed=(\d+)\s+filed-open=(\d+)(?:\s+found-in-round=(\d+))?/i);
  const o = String(body || '').match(/operator:\s*play=(\d+)\s+audits=(\d+)/i);
  return {
    queue: q ? { closed: +q[1], filed: +q[2], filedOpen: +q[3], foundInRound: q[4] == null ? null : +q[4] } : null,
    operator: o ? { play: +o[1], audit: +o[2] } : null,
  };
}

/** Cases by class in a play sheet: the cases he handled. */
export function sheetCases(sheet) {
  const c = { play: 0, look: 0, verified: 0 };
  for (const x of sheet?.cases || []) if (x.class in c) c[x.class]++;
  return c;
}

/**
 * One round's row. `round` = {n, title, created, closed, body}; `stateOf(n)` = {closed, closedAt} of an
 * issue; `opened` = every issue opened in the window, {n, created, body, open}; `sheet` = the play sheet.
 */
export function roundRow(round, stateOf, opened, sheet) {
  const end = round.closed || new Date().toISOString();
  const grace = new Date(Date.parse(end) + 864e5).toISOString();
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
    row.closed = items.filter((n) => { const s = stateOf(n); return s && s.closed && s.closedAt >= round.created && s.closedAt <= grace; }).length;
    row.filed = filedList.length;
    row.filedOpen = filedList.filter((i) => i.open).length;
    row.foundInRound = null;
  }
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

function main() {
  const args = process.argv.slice(2);
  const outDir = args.find((a) => !a.startsWith('--'));
  if (!outDir) { console.error('usage: node scripts/round-metrics.mjs <out-dir> [--since YYYY-MM-DD]'); process.exit(1); }
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : '2026-10-01';
  const repo = 'dcodish/geo_builder';
  const gh = (p) => JSON.parse(execFileSync('gh', ['api', p], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

  // Every issue opened since `since` (newest first, by number), bodies included. Pages are requested by
  // number: `--paginate` follows `repositories/{id}` links that the cloud proxy refuses (ADR-W-159).
  const all = [];
  for (let page = 1; ; page++) {
    const rows = gh(`repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=100&page=${page}`);
    for (const i of rows) if (!i.pull_request) all.push(i);
    if (rows.length < 100 || rows.at(-1).created_at.slice(0, 10) < since) break;
  }
  const byNumber = new Map(all.map((i) => [i.number, i]));
  const stateOf = (n) => {
    if (!byNumber.has(n)) { try { byNumber.set(n, gh(`repos/${repo}/issues/${n}`)); } catch { return null; } }
    const i = byNumber.get(n);
    return { closed: i.state === 'closed', closedAt: i.closed_at || '' };
  };
  const opened = all.map((i) => ({ n: i.number, created: i.created_at, body: i.body || '', open: i.state === 'open' }));
  const rounds = all
    .filter((i) => /^fix-round\s/i.test(i.title) && i.created_at.slice(0, 10) >= since)
    .map((i) => ({ n: i.number, title: i.title, created: i.created_at, closed: i.closed_at, body: i.body || '' }))
    .sort((a, b) => a.created.localeCompare(b.created));
  const rows = rounds.map((r) => {
    const f = path.join(root, 'scripts', 'playsheets', `round-${r.n}.json`);
    const sheet = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    return roundRow(r, stateOf, opened, sheet);
  });
  mkdirSync(outDir, { recursive: true });
  const doc = { asOf: new Date().toISOString().slice(0, 10), since, minutesPerCase: MINUTES, rulesFrom: RULES_FROM, rounds: rows };
  writeFileSync(path.join(outDir, 'rounds.json'), JSON.stringify(doc, null, 1));
  const done = rows.filter((r) => !r.running);
  const sum = (k) => done.reduce((a, r) => a + r[k], 0);
  console.log(`${rows.length} rounds since ${since}: closed ${sum('closed')}, filed ${sum('filed')}, net ${sum('net') > 0 ? '+' : ''}${sum('net')}; ${done.filter((r) => r.flag).length} did not shrink the queue`);
  for (const r of rows) console.log(`  #${r.n} ${r.date} named ${r.named} closed ${r.closed} filed ${r.filed} net ${r.net}${r.flag ? ' ⚑' : ''} · operator ${r.operator.play}🎮 ${r.operator.look}👁 ${r.operator.verified}✅ ≈${r.minutes} min [${r.source}${r.hasSheet ? '' : ', no sheet'}]`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
