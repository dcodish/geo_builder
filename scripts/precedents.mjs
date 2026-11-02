#!/usr/bin/env node
/**
 * precedents — everything the operator has ruled, in one searchable index (#2661,
 * [ADR-W-173](../docs/06w-decisions-workspace.md#adr-w-173)).
 *
 * The judge agent (`.claude/agents/judge.md`) rules on his behalf only from a dated precedent it can
 * quote. This builds the record it searches:
 *   - every issue comment that reads as a ruling (the `RULING_MARKERS` of queue-hygiene.mjs) or quotes
 *     the operator with a date;
 *   - every ADR in the five decision logs whose text carries an `**Operator` line or an operator quote;
 *   - the judge's own accepted rulings and his overrules (`scripts/judgments/ledger.json`).
 *
 *   node scripts/precedents.mjs build            fetch new comments (incremental) and rebuild the index
 *   node scripts/precedents.mjs search <words…>  the best-matching precedents, quoted with date and link
 *       [--limit 12]
 * The index is `reports/precedents.json` (gitignored, rebuilt on demand). REST only (`gh api`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { RULING_MARKERS } from './queue-hygiene.mjs';

const REPO = 'dcodish/geo_builder';
const LOGS = ['docs/06-decisions.md', 'docs/06b-decisions-3d.md', 'docs/06c-decisions-analytic.md', 'docs/06d-decisions-complex.md', 'docs/06w-decisions-workspace.md'];
/** The operator quoted with a date: «Operator, 2026-10-15:», «operator ruling 2026-10-30», «(operator, 2026-09-20)». */
export const DATED_QUOTE = /\boperator\b[^\n]{0,40}\b20\d\d-\d\d-\d\d\b/i;

/** Does a comment record something the operator ruled? */
export function isRuling(body) {
  const b = String(body || '');
  return RULING_MARKERS.some((re) => re.test(b)) || DATED_QUOTE.test(b);
}

/** The ADRs of one log that carry the operator's words: {id, title, anchor, text}. */
export function operatorAdrs(markdown, file) {
  const out = [];
  const parts = String(markdown).split(/^(?=## ADR-)/m);
  for (const p of parts) {
    const h = p.match(/^## (ADR-[\w-]+?\d+)\s*[—-]?\s*(.*)$/m);
    if (!h) continue;
    if (!/\*\*Operator|operator (ruling|decision|answer)|\boperator\b[^\n]{0,40}20\d\d-\d\d-\d\d/i.test(p)) continue;
    const date = (p.match(/\b(20\d\d-\d\d-\d\d)\b/) || [])[1] || '';
    out.push({ kind: 'adr', id: h[1], title: h[2].trim(), file, date, text: p.slice(0, 6000) });
  }
  return out;
}

const STOP = new Set('the a an of to in on is it and or for be by that this with as at are was not from does do when what which who his he him her she they them its into than then there their have has had will would can could may should one two'.split(' '));
/** Words worth matching: Latin lower-cased, Hebrew with its one-letter prefixes (ו ה ב ל מ ש כ) stripped too. */
export function terms(text) {
  const out = new Set();
  for (const w of String(text).toLowerCase().match(/[a-z][a-z0-9-]{2,}|[א-ת]{2,}|[a-z]{1,2}\d|\d+-?d/g) || []) {
    if (STOP.has(w)) continue;
    out.add(w);
    if (/^[וה בלמשכ]/.test(w) && /[א-ת]/.test(w) && w.length > 3) out.add(w.replace(/^[והבלמשכ]+/, ''));
  }
  return out;
}

/** Rank records against a query: term overlap, rarer terms weigh more; ties go to the newer ruling. */
export function search(records, query, limit = 12) {
  const q = [...terms(query)];
  if (!q.length) return [];
  const df = new Map(q.map((t) => [t, 0]));
  const sets = records.map((r) => terms(`${r.title || ''} ${r.text}`));
  for (const s of sets) for (const t of q) if (s.has(t)) df.set(t, df.get(t) + 1);
  const n = records.length || 1;
  return records
    .map((r, i) => ({ r, score: q.reduce((a, t) => a + (sets[i].has(t) ? Math.log(1 + n / (1 + df.get(t))) : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || String(b.r.date).localeCompare(String(a.r.date)))
    .slice(0, limit);
}

function root() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
}

function build() {
  const dir = path.join(root(), 'reports');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'precedents.json');
  const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { since: null, comments: [] };
  const gh = (p) => JSON.parse(execFileSync('gh', ['api', p], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  const byId = new Map(old.comments.map((c) => [c.cid, c]));
  let newest = old.since;
  for (let page = 1; ; page++) {
    const rows = gh(`repos/${REPO}/issues/comments?per_page=100&page=${page}&sort=updated&direction=asc${old.since ? `&since=${old.since}` : ''}`);
    for (const c of rows) {
      if (!newest || c.updated_at > newest) newest = c.updated_at;
      if (!isRuling(c.body)) { byId.delete(c.id); continue; }
      const issue = +c.issue_url.split('/').pop();
      byId.set(c.id, { kind: 'comment', cid: c.id, issue, url: c.html_url, date: c.created_at.slice(0, 10), text: c.body.slice(0, 6000) });
    }
    if (rows.length < 100) break;
  }
  const adrs = LOGS.flatMap((f) => operatorAdrs(readFileSync(path.join(root(), f), 'utf8'), f));
  const comments = [...byId.values()];
  writeFileSync(file, JSON.stringify({ since: newest, builtAt: new Date().toISOString(), comments, adrs }));
  console.log(`precedents: ${comments.length} ruling comments, ${adrs.length} ADRs with the operator's words → ${path.relative(root(), file)}`);
}

function loadAll() {
  const file = path.join(root(), 'reports', 'precedents.json');
  if (!existsSync(file)) { console.error('no index yet: run `node scripts/precedents.mjs build`'); process.exit(1); }
  const idx = JSON.parse(readFileSync(file, 'utf8'));
  const ledgerFile = path.join(root(), 'scripts', 'judgments', 'ledger.json');
  const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : { judgments: [] };
  // A judgment that stood is precedent of the judge's own; an overrule is the operator's word, and wins.
  const judged = ledger.judgments
    .filter((j) => j.status === 'stood' || j.status === 'overruled')
    .map((j) => ({ kind: j.status === 'overruled' ? 'overrule' : 'judgment', id: j.id, date: (j.decidedAt || j.at || '').slice(0, 10), text: `${j.question}\n${j.status === 'overruled' ? `OPERATOR OVERRULED: ${j.overrule?.note || ''}` : `Ruled: ${j.ruling}`}` }));
  return [...idx.comments, ...idx.adrs, ...judged];
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'build') return build();
  if (cmd === 'search') {
    const li = rest.indexOf('--limit');
    const limit = li >= 0 ? +rest[li + 1] : 12;
    const words = rest.filter((_, i) => i !== li && i !== li + 1).join(' ');
    for (const { r, score } of search(loadAll(), words, limit)) {
      const where = r.kind === 'comment' ? `#${r.issue} ${r.url}` : r.kind === 'adr' ? `${r.id} (${r.file})` : `${r.kind} ${r.id}`;
      console.log(`\n=== ${score.toFixed(1)} · ${r.date || 'undated'} · ${where}${r.title ? ' — ' + r.title.slice(0, 120) : ''}\n${r.text.slice(0, 1500)}`);
    }
    return;
  }
  console.error('usage: node scripts/precedents.mjs build | search <words…> [--limit N]');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
