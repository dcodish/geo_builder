#!/usr/bin/env node
/**
 * judgments — the record of what the judge ruled on the operator's behalf, and what he overruled
 * (#2661, [ADR-W-173](../docs/06w-decisions-workspace.md#adr-w-173)).
 *
 * Operator, 2026-11-02: *"I think need a judgment agent that can make decisions on my behalf based on
 * historic decisions and guidelines I gave"*, and on the design: *"Go ahead. Build this now"*.
 *
 * A judgment is `pending` until the daily digest's window passes. It then `stood`, unless he overruled
 * it, and an overrule is his word: it becomes precedent, and its CLASS goes back to him. Every later
 * question of that class escalates until three judgments of it in a row stand.
 *
 *   node scripts/judgments.mjs record <verdict.json>      append the judge's verdicts (one object or an array)
 *   node scripts/judgments.mjs digest [--md]              what he has not seen yet, as a skim list
 *   node scripts/judgments.mjs overrule <id> --note "…"   his overrule, in his words
 *   node scripts/judgments.mjs settle                     judgments older than the window stand
 *   node scripts/judgments.mjs demoted                    the classes that must escalate
 *
 * Ledger: `scripts/judgments/ledger.json`, tracked, so it travels with git like the play-sheet audits.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const WINDOW_HOURS = 24;
export const CLEAN_TO_RESTORE = 3;
/** Never judged: the operator kept these (ruling 2026-11-02 on #2661). */
export const RESERVED = ['reverses-shipped', 'kept-by-operator', 'feature-scope-or-priority', 'no-precedent'];

export const emptyLedger = () => ({ judgments: [], demoted: {} });

/** A verdict the judge returned, checked: a ruling must quote a dated precedent; an escalation needs a reason. */
export function validateVerdict(v) {
  const p = [];
  if (!v || typeof v !== 'object') return ['not an object'];
  if (!v.id) p.push('id missing');
  if (!v.question) p.push('question missing');
  if (!v.class) p.push('class missing');
  if (v.verdict === 'ruled') {
    if (!v.choice) p.push('a ruling names its choice');
    if (!v.ruling) p.push('a ruling states the rule in one sentence');
    const pr = Array.isArray(v.precedents) ? v.precedents : [];
    if (!pr.length) p.push('a ruling quotes at least one precedent');
    for (const x of pr) if (!x.quote || !/^20\d\d-\d\d-\d\d/.test(x.date || '') || !x.link) p.push(`precedent without quote, date or link: ${JSON.stringify(x).slice(0, 80)}`);
  } else if (v.verdict === 'escalate') {
    if (!v.reason) p.push('an escalation says why');
  } else p.push(`verdict must be "ruled" or "escalate", got ${JSON.stringify(v.verdict)}`);
  return p;
}

/**
 * Append verdicts. A ruling in a demoted class is turned into an escalation here, whatever the judge
 * said: the class is his until it is restored.
 */
export function record(ledger, verdicts, at) {
  for (const v of verdicts) {
    const problems = validateVerdict(v);
    if (problems.length) throw new Error(`${v?.id || '?'}: ${problems.join('; ')}`);
    const j = { ...v, at, status: v.verdict === 'ruled' ? 'pending' : 'escalated' };
    if (v.verdict === 'ruled' && v.class in ledger.demoted) {
      j.status = 'escalated';
      j.reason = `class "${v.class}" is back with the operator after an overrule (${ledger.demoted[v.class]}/${CLEAN_TO_RESTORE} clean since)`;
    }
    ledger.judgments = ledger.judgments.filter((x) => x.id !== v.id).concat(j);
  }
  return ledger;
}

/** His overrule: the judgment is his now, and its class goes back to him. */
export function overrule(ledger, id, note, at) {
  const j = ledger.judgments.find((x) => x.id === id);
  if (!j) throw new Error(`no judgment ${id}`);
  j.status = 'overruled';
  j.overrule = { note, at };
  ledger.demoted[j.class] = 0;
  return ledger;
}

/** Pending judgments older than the window stand; each one counts toward restoring a demoted class. */
export function settle(ledger, now, windowHours = WINDOW_HOURS) {
  const cutoff = Date.parse(now) - windowHours * 36e5;
  const stood = [];
  for (const j of ledger.judgments.filter((x) => x.status === 'pending' && Date.parse(x.at) <= cutoff).sort((a, b) => a.at.localeCompare(b.at))) {
    j.status = 'stood';
    j.decidedAt = now;
    stood.push(j.id);
    if (j.class in ledger.demoted) {
      ledger.demoted[j.class]++;
      if (ledger.demoted[j.class] >= CLEAN_TO_RESTORE) delete ledger.demoted[j.class];
    }
  }
  return stood;
}

/** The skim list: one line per ruling, with the quote it rests on. */
export function digest(ledger, md = false) {
  const pend = ledger.judgments.filter((j) => j.status === 'pending');
  const esc = ledger.judgments.filter((j) => j.status === 'escalated' && !j.answered);
  const lines = [];
  if (md) lines.push(`## Ruled on your behalf (${pend.length}) — each stands in ${WINDOW_HOURS} h unless you object`, '');
  for (const j of pend) {
    const p = j.precedents[0];
    lines.push(md
      ? `- **${j.id}** · ${j.question}\n  → **${j.choice}**: ${j.ruling}\n  because you said *"${p.quote}"* (${p.date}, ${p.link})`
      : `${j.id} → ${j.choice}: ${j.ruling}  [${p.date} ${p.link}]`);
  }
  if (md) lines.push('', `## Sent back to you (${esc.length})`, '');
  for (const j of esc) lines.push(md ? `- **${j.id}** · ${j.question}\n  why: ${j.reason}` : `${j.id} ESCALATED: ${j.reason}`);
  return lines.join('\n');
}

function main() {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const file = path.join(root, 'scripts', 'judgments', 'ledger.json');
  const load = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : emptyLedger());
  const save = (l) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(l, null, 2) + '\n'); };
  const [cmd, arg] = process.argv.slice(2);
  const val = (f) => { const a = process.argv; return a.includes(f) ? a[a.indexOf(f) + 1] : undefined; };
  const now = new Date().toISOString();
  if (cmd === 'record') {
    const raw = JSON.parse(readFileSync(arg, 'utf8'));
    const l = record(load(), Array.isArray(raw) ? raw : [raw], now);
    save(l);
    const mine = (Array.isArray(raw) ? raw : [raw]).map((v) => l.judgments.find((j) => j.id === v.id));
    console.log(`recorded ${mine.length}: ${mine.filter((j) => j.status === 'pending').length} ruled, ${mine.filter((j) => j.status === 'escalated').length} sent back to the operator`);
  } else if (cmd === 'overrule') {
    const note = val('--note');
    if (!arg || !note) { console.error('usage: overrule <id> --note "<his words>"'); process.exit(1); }
    save(overrule(load(), arg, note, now));
    console.log(`${arg} overruled; its class goes back to the operator until ${CLEAN_TO_RESTORE} judgments of it stand`);
  } else if (cmd === 'settle') {
    const l = load(); const s = settle(l, now); save(l);
    console.log(`${s.length} stood${s.length ? ': ' + s.join(' ') : ''} · demoted: ${JSON.stringify(l.demoted)}`);
  } else if (cmd === 'digest') {
    console.log(digest(load(), process.argv.includes('--md')));
  } else if (cmd === 'demoted') {
    console.log(JSON.stringify(load().demoted));
  } else {
    console.error('usage: record <file> | digest [--md] | overrule <id> --note "…" | settle | demoted');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
