#!/usr/bin/env node
/**
 * CLOSE A DRIVEN SHEET — the session closes ✅ and 👁, the operator gets 🎮 and the spot audits
 * (#2654 step 3, ADR-W-168 §2).
 *
 *   npm run playsheet:close -- --sheet scripts/playsheets/<name>.json [--reviews <verdicts.json>]
 *       Reads the driver's manifest, folds in the blind reviewer's verdicts ([{id, pass, saw}]),
 *       queues the spot audits in the tracked ledger, and re-renders report.html. Exits non-zero
 *       while any case is red or still awaiting its blind review.
 *   npm run playsheet:close -- --audit <sheet>:<id> pass|fail [--note "<his words>"]
 *       Records his verdict on a pending audit. A fail demotes the kind (every closed case of it goes
 *       to him) until three clean audits.
 *   npm run playsheet:close -- --pending
 *       Lists the audits waiting for his next sitting.
 *
 * The ledger is `scripts/playsheets/spot-audits.json`: tracked, so it travels with git like the specs.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { renderReport } from './lib/play-sheet-core.mjs';
import { closureOf, emptyLedger, pickSpotAudits, queueAudits, recordAudit } from './lib/case-closure.mjs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
export const LEDGER_DEFAULT = path.join(repoRoot, 'scripts', 'playsheets', 'spot-audits.json');
/** `--ledger <path>` points a trial run elsewhere, so a demo never queues audits for the operator. */
const ledgerArg = process.argv.indexOf('--ledger');
const LEDGER = ledgerArg > 0 ? path.resolve(process.argv[ledgerArg + 1]) : LEDGER_DEFAULT;

function fail(msg) {
  console.error(`play-sheet-close: ${msg}`);
  process.exit(1);
}

async function readLedger() {
  return existsSync(LEDGER) ? JSON.parse(await readFile(LEDGER, 'utf8')) : emptyLedger();
}
async function writeLedger(ledger) {
  await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
}
const today = () => new Date().toISOString().slice(0, 10);

async function closeSheet(sheetPath, reviewsPath, outArg) {
  const sheet = JSON.parse(await readFile(sheetPath, 'utf8'));
  const outDir = outArg ?? path.join(repoRoot, 'reports', 'playsheets', sheet.name);
  const manifestPath = path.join(outDir, 'manifest.json');
  if (!existsSync(manifestPath)) fail(`no manifest at ${manifestPath} — drive the sheet first (npm run playsheet)`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const reviews = reviewsPath ? JSON.parse(await readFile(reviewsPath, 'utf8')) : [];
  const reviewOf = new Map((Array.isArray(reviews) ? reviews : reviews.cases ?? []).map((v) => [v.id, v]));

  const specOf = (id) => sheet.cases.find((c) => c.id === id);
  for (const r of manifest.results) r.closure = closureOf(specOf(r.id), r.problems, reviewOf.get(r.id));

  const ledger = await readLedger();
  const closed = manifest.results.filter((r) => r.closure.state === 'closed').map((r) => specOf(r.id));
  const audits = pickSpotAudits(sheet.name, closed, ledger);
  queueAudits(ledger, sheet.name, audits, today());
  await writeLedger(ledger);
  for (const r of manifest.results) if (audits.some((a) => a.id === r.id)) r.closure.audit = true;

  manifest.closedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeFile(
    path.join(outDir, 'report.html'),
    renderReport({ sheet, results: manifest.results, generatedAt: manifest.generatedAt, audits: ledger.pending }),
  );

  const by = (st) => manifest.results.filter((r) => r.closure.state === st);
  console.log(
    `${sheet.name}: ${by('operator').length} 🎮 for the operator · ${by('closed').length} closed by the session ` +
      `(${by('closed').filter((r) => r.closure.method === 'assertion').length} on assertion, ` +
      `${by('closed').filter((r) => r.closure.method === 'blind-review').length} on blind review) · ` +
      `${audits.length} queued as spot audits · ${ledger.pending.length} audits pending in all`,
  );
  const red = by('red');
  const waiting = by('awaiting-review');
  if (red.length) fail(`${red.length} red case(s): ${red.map((r) => `${r.id}${r.closure.saw ? ` (${r.closure.saw})` : ''}`).join(' · ')}`);
  if (waiting.length) fail(`${waiting.length} case(s) still need a blind review: ${waiting.map((r) => r.id).join(' ')}`);
  // The deploy rule (ADR-W-168 §5) reads this line: nothing for him means the round may deploy itself.
  console.log(by('operator').length === 0 ? 'NOTHING FOR THE OPERATOR — eligible to deploy without his play (ADR-W-168 §5).' : `WAITS FOR HIS PLAY — ${by('operator').length} 🎮 case(s).`);
}

async function run() {
  const a = process.argv.slice(2);
  const val = (flag) => (a.includes(flag) ? a[a.indexOf(flag) + 1] : undefined);
  if (a.includes('--pending')) {
    const { pending, demoted } = await readLedger();
    for (const p of pending) console.log(`${p.sheet}:${p.id} [${p.kind}] ${p.base}${p.path ?? ''} — ${p.lines.join(' / ')} — look for: ${p.lookFor}`);
    console.log(`${pending.length} pending · demoted kinds: ${Object.keys(demoted).join(', ') || 'none'}`);
    return;
  }
  if (a.includes('--audit')) {
    const key = val('--audit');
    const verdict = a[a.indexOf('--audit') + 2];
    if (!key?.includes(':') || !['pass', 'fail'].includes(verdict)) fail('usage: --audit <sheet>:<id> pass|fail [--note "…"]');
    const [sheetName, id] = [key.slice(0, key.lastIndexOf(':')), key.slice(key.lastIndexOf(':') + 1)];
    const ledger = recordAudit(await readLedger(), sheetName, id, verdict === 'pass', today(), val('--note'));
    await writeLedger(ledger);
    console.log(`recorded ${key} ${verdict} · demoted kinds: ${JSON.stringify(ledger.demoted)}`);
    return;
  }
  const sheet = val('--sheet');
  if (!sheet) fail('usage: --sheet <spec.json> [--reviews <verdicts.json>] [--out <dir>] | --audit <sheet>:<id> pass|fail | --pending');
  await closeSheet(sheet, val('--reviews'), val('--out'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((e) => fail(e.stack || e.message));
}
