/**
 * Triage step 2 — BUILD HTML (fast). Env-gated tool, skipped in the normal suite.
 *
 *   DATA_FILE=/tmp/triage-data.jsonl OUT_FILE=reports/triage-report.html \
 *     npx vitest run src/validation/__tests__/triageHtml.test.ts
 *
 * Reads the JSONL produced by `triageDump.test.ts`, applies the operator VERDICTS, and writes the
 * self-contained HTML report. No replay → re-run instantly after editing `triageVerdicts.ts`.
 */
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildTriageHtml } from '../triageReport';
import type { SessionData } from '../triageReport';
import { VERDICTS } from '../triageVerdicts';

it.skipIf(!process.env.DATA_FILE)('build html report', () => {
  const rows = readFileSync(process.env.DATA_FILE!, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as SessionData);
  const bySid = new Map<string, SessionData>();
  for (const r of rows) bySid.set(r.sid, r); // dedupe by sid (keep last)
  const sessions = [...bySid.values()].sort((a, b) => ((a.startedAt ?? '') < (b.startedAt ?? '') ? -1 : 1));
  writeFileSync(process.env.OUT_FILE!, buildTriageHtml(sessions, VERDICTS));
  // eslint-disable-next-line no-console
  console.log(`wrote ${sessions.length} sessions → ${process.env.OUT_FILE}`);
});
