/**
 * The theorem-feed audit runner (docs/18 §9.5) — env-gated like the triage dump specs.
 *
 * Always on: the fixtures leg — every saved `fixtures/*.geo.json` replays through `auditFigure`
 * without throwing (the fixtures net's theorem companion; it asserts robustness, not content —
 * content verdicts are the operator's, via the report).
 *
 * Env-gated: the debug-log leg — replays every session in a debug log and writes the operator's
 * review sheet. Regenerate with:
 *   $env:THEOREM_AUDIT_LOG = "logs/debug-log.jsonl"; $env:THEOREM_AUDIT_OUT = "reports/theorem-audit.md"
 *   npx vitest run src/theorems/__tests__/theorem-audit.test.ts
 * Optional: THEOREM_AUDIT_MAX (default 40) caps sessions, newest last; long/coupled figures can
 * replay slowly, so the cap keeps a pass affordable.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserializeFigure } from '@/store/figureFile';
import { auditFigure, auditReport, figuresFromDebugLog } from '../audit';
import type { AuditedFigure } from '../audit';

const here = dirname(fileURLToPath(import.meta.url));

const fixtures = import.meta.glob('../../__tests__/fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

describe('theorem audit — fixtures leg (always on)', () => {
  it('finds the fixtures net', () => {
    expect(Object.keys(fixtures).length).toBeGreaterThan(0);
  });

  for (const [file, text] of Object.entries(fixtures)) {
    const name = file.split('/').pop()!.replace('.geo.json', '');
    it(`audits ${name} without throwing`, { timeout: 60_000 }, () => {
      const r = deserializeFigure(text);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const audited = auditFigure(name, r.file.facts);
      expect(audited.steps.length).toBeGreaterThan(0);
    });
  }
});

it.skipIf(!process.env.THEOREM_AUDIT_LOG)('write the debug-log audit report', { timeout: 1_800_000 }, () => {
  const logPath = resolve(here, '../../../', process.env.THEOREM_AUDIT_LOG!);
  const max = Number(process.env.THEOREM_AUDIT_MAX) || 40;
  const sessions = figuresFromDebugLog(readFileSync(logPath, 'utf8'));
  const picked = sessions.slice(-max);

  const audited: AuditedFigure[] = [];
  for (const s of picked) {
    try {
      audited.push(auditFigure(s.session, s.facts));
    } catch (e) {
      audited.push({ source: `${s.session} (replay threw: ${String(e).slice(0, 120)})`, steps: [], finalFeed: [] });
    }
  }
  // The fixtures ride along so the report covers the curated set too.
  for (const [file, text] of Object.entries(fixtures)) {
    const r = deserializeFigure(text);
    if (r.ok) audited.push(auditFigure(`fixture: ${file.split('/').pop()!}`, r.file.facts));
  }

  const out = resolve(here, '../../../', process.env.THEOREM_AUDIT_OUT ?? 'reports/theorem-audit.md');
  writeFileSync(out, auditReport(audited), 'utf8');
  console.log(`audited ${audited.length} figures (${sessions.length} sessions in log) → ${out}`);
  expect(audited.length).toBeGreaterThan(0);
});
