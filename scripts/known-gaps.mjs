#!/usr/bin/env node
/**
 * known-gaps — park what nobody hit, reopen it the day somebody does (#2654 idea 4,
 * [ADR-W-169](../docs/06w-decisions-workspace.md#adr-w-169)).
 *
 * Operator, 2026-11-01: *"known issues dont go away and if we ever run into them again, we move them back
 * the que and not create new ones. eventually we might reach them"*.
 *
 * A P3 that a session found, that no student and not the operator ever hit, and that nobody touched for
 * 30 days, is closed as `icebox` and listed in docs/known-gaps.md. It is not forgotten: the list is where
 * a check-before-filing search lands (the issue-create guard names it), and a later hit REOPENS the
 * original issue (`--reopen`), never files a new one.
 *
 * Never parked: any bug (docs/22 §2 never parks something that shows something false — a wrong figure, a
 * false "contradicts", a guide sentence that fails — and labels cannot tell those apart), a `reported` issue, a `needs-operator` question, a round's own issue, anything the roadmap plan names.
 *
 *   node scripts/known-gaps.mjs [--days 30]                        list the candidates (no writes)
 *   node scripts/known-gaps.mjs --apply --plan <plan.json> [--days 30]
 *        park them: comment, `icebox`, close "not planned"; add their rows to docs/known-gaps.md; and park
 *        any parity gap they own (GAP_ISSUES → 'icebox', the gap → `parked: true`, ADR-W-119). The file
 *        edits are left in the working tree for the session to commit (a fix round's batch carries them).
 *   node scripts/known-gaps.mjs --reopen <N> --note "<who hit it, where>"
 *        reopen it, drop `icebox`, remove its row, un-park its parity gaps.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const IDLE_DAYS = 30;
/** Labels that keep an issue in the queue whatever its age. */
export const KEEP = ['P1', 'P2', 'later', 'reported', 'wrong-answer', 'needs-operator', 'in-round', 'awaiting-play', 'icebox'];
const REPO = 'dcodish/geo_builder';
const ROWS_START = '<!-- rows: maintained by scripts/known-gaps.mjs; one per parked issue, by number -->';

const labelsOf = (i) => (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name));

/** Why an open issue is not parked, or null when it is a candidate. */
export function keepReason(issue, { now, days = IDLE_DAYS, planIssues = new Set() }) {
  const l = labelsOf(issue);
  if (!l.includes('P3')) return 'not P3';
  const k = KEEP.find((x) => l.includes(x));
  if (k) return k;
  // A bug stays: docs/22 §2 never parks a false "contradicts" or a guide sentence that fails, and only
  // reading the bug tells which kind it is. Features and debt are what expire.
  if (l.includes('bug')) return 'a bug';
  if (/^fix-round\s/i.test(issue.title || '')) return 'a round';
  if (planIssues.has(issue.number)) return 'in the plan';
  const idle = (Date.parse(now) - Date.parse(issue.updatedAt || issue.updated_at)) / 864e5;
  if (idle < days) return `active ${Math.floor(idle)} days ago`;
  return null;
}

const productOf = (l) => ['2d', '3d', 'analytic', 'complex', 'server', 'workspace'].filter((p) => l.includes(p)).join(', ') || '—';
const typeOf = (l) => ['bug', 'feature', 'debt'].find((t) => l.includes(t)) || '—';
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** One table row of docs/known-gaps.md. */
export function gapRow(issue, parkedOn) {
  const l = labelsOf(issue);
  const n = issue.number;
  return `| [#${n}](https://github.com/${REPO}/issues/${n}) | ${cell(issue.title)} | ${productOf(l)} | ${typeOf(l)} | ${parkedOn} | ${String(issue.updatedAt || issue.updated_at).slice(0, 10)} |`;
}

const rowNumber = (line) => +((line.match(/^\| \[#(\d+)\]/) || [])[1] || 0);

/** The doc with these rows added (an issue already listed is replaced), kept in issue order. */
export function addRows(md, rows) {
  const at = md.indexOf(ROWS_START);
  if (at < 0) throw new Error('docs/known-gaps.md has lost its rows marker');
  const head = md.slice(0, at + ROWS_START.length);
  const existing = md.slice(at + ROWS_START.length).split('\n').filter((x) => rowNumber(x));
  const incoming = new Map(rows.map((r) => [rowNumber(r), r]));
  const kept = existing.filter((r) => !incoming.has(rowNumber(r)));
  const all = [...kept, ...incoming.values()].sort((a, b) => rowNumber(a) - rowNumber(b));
  return head + '\n' + all.join('\n') + (all.length ? '\n' : '');
}

/** The doc without issue n's row. */
export function removeRow(md, n) {
  return md.split('\n').filter((x) => rowNumber(x) !== n).join('\n');
}

/** The parity fixture with issue n's gaps parked (ADR-W-119: closing an owning issue parks its gaps). */
export function parkInParity(src, n) {
  return src
    .replace(new RegExp(`('#${n}':\\s*)'open'`, 'g'), "$1'icebox'")
    .replace(new RegExp(`(issue:\\s*'#${n}')(\\s*\\})`, 'g'), '$1, parked: true$2');
}

/** The parity fixture with issue n's gaps scheduled again. */
export function unparkInParity(src, n) {
  return src
    .replace(new RegExp(`('#${n}':\\s*)'(?:icebox|closed)'`, 'g'), "$1'open'")
    .replace(new RegExp(`(issue:\\s*'#${n}'),\\s*parked:\\s*true`, 'g'), '$1');
}

export const PARK_COMMENT = (since) =>
  `Parked as a known gap ([ADR-W-169](https://github.com/${REPO}/blob/main/docs/06w-decisions-workspace.md#adr-w-169), #2654): ` +
  `a P3 a session found, that no student and not the operator has hit, untouched since ${since}. ` +
  `It is listed in [docs/known-gaps.md](https://github.com/${REPO}/blob/main/docs/known-gaps.md). ` +
  `Its plan stays in this thread; \`auto-ok\` is removed, so a reopen re-measures and re-arms it. ` +
  `The day someone hits it, this issue is REOPENED (\`node scripts/known-gaps.mjs --reopen <N>\`), never filed again.`;

function main() {
  const a = process.argv.slice(2);
  const val = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const docPath = path.join(root, 'docs', 'known-gaps.md');
  const parityPath = path.join(root, 'shell', '__tests__', 'fixtures', 'geo-input-parity.ts');
  const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const today = new Date().toISOString().slice(0, 10);

  if (a.includes('--reopen')) {
    const n = +val('--reopen');
    const note = val('--note');
    if (!n || !note) { console.error('usage: --reopen <N> --note "<who hit it, where>"'); process.exit(1); }
    gh(['issue', 'reopen', String(n), '-R', REPO, '--comment', `Hit again ${today}: ${note}. Reopened from the known gaps (ADR-W-169) — back in the queue under its own number.`]);
    gh(['issue', 'edit', String(n), '-R', REPO, '--remove-label', 'icebox']);
    writeFileSync(docPath, removeRow(readFileSync(docPath, 'utf8'), n));
    writeFileSync(parityPath, unparkInParity(readFileSync(parityPath, 'utf8'), n));
    console.log(`#${n} reopened; its row and any parked parity gap are restored in the working tree — commit them.`);
    return;
  }

  const days = +(val('--days') || IDLE_DAYS);
  const planPath = val('--plan');
  const planIssues = new Set(planPath ? JSON.parse(readFileSync(planPath, 'utf8')).workstreams.flatMap((w) => w.issues) : []);
  const open = [];
  for (let page = 1; ; page++) {
    const rows = JSON.parse(gh(['api', `repos/${REPO}/issues?state=open&labels=P3&per_page=100&page=${page}`]));
    for (const i of rows) if (!i.pull_request) open.push(i);
    if (rows.length < 100) break;
  }
  const now = new Date().toISOString();
  const picked = open.filter((i) => !keepReason(i, { now, days, planIssues })).sort((x, y) => x.number - y.number);
  console.log(`${open.length} open P3 · ${picked.length} idle ${days}+ days and never hit${planPath ? '' : ' (plan not given: plan items are NOT excluded)'}`);
  for (const i of picked) console.log(`  #${i.number} ${String(i.updated_at).slice(0, 10)} [${labelsOf(i).join(',')}] ${i.title.slice(0, 90)}`);
  if (!a.includes('--apply')) return;
  if (!planPath) { console.error('--apply needs --plan <plan/current.json>: a planned issue is never parked'); process.exit(1); }

  let doc = readFileSync(docPath, 'utf8');
  let parity = readFileSync(parityPath, 'utf8');
  for (const i of picked) {
    const since = String(i.updated_at).slice(0, 10);
    gh(['issue', 'comment', String(i.number), '-R', REPO, '--body', PARK_COMMENT(since)]);
    gh(['issue', 'edit', String(i.number), '-R', REPO, '--add-label', 'icebox', ...(labelsOf(i).includes('auto-ok') ? ['--remove-label', 'auto-ok'] : [])]);
    gh(['issue', 'close', String(i.number), '-R', REPO, '--reason', 'not planned']);
    doc = addRows(doc, [gapRow(i, today)]);
    parity = parkInParity(parity, i.number);
    console.log(`  parked #${i.number}`);
  }
  writeFileSync(docPath, doc);
  writeFileSync(parityPath, parity);
  console.log(`${picked.length} parked; docs/known-gaps.md and the parity fixture are edited in the working tree — commit them.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
