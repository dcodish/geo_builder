/**
 * The T2 fill-order report (theorem-discovery v2 T1 — docs/18 §4 "priority order is measured, not
 * guessed"). Counts each ABSENT id's appearances across the 25 reviewed corpus questions'
 * `expectSurfaced` + `solutionUses` lists (theorem-ground-truth.md) and ranks the coverage-fill
 * work by that measured student value. OFFLINE AUTHORING AID ONLY (operator ruling D3 — no runtime
 * scores): the output is a review sheet, `reports/theorem-fill-order.md`.
 *
 * Env-gated like the triage dump specs — regenerate with:
 *   $env:THEOREM_FREQ_OUT = "reports/theorem-fill-order.md"; npx vitest run src/theorems/__tests__/fill-order.test.ts
 *
 * A tiny always-on sanity block keeps the ground-truth parser honest (known anchors extract
 * correctly), so the report can't silently rot between regenerations.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGroundTruth, extractIds } from '../groundTruth';
import { THEOREM_COVERAGE, dispositionOf } from '../coverage';

const here = dirname(fileURLToPath(import.meta.url));
const gtPath = resolve(here, '../../../docs/sample questions/theorem-ground-truth.md');

describe('ground-truth parser sanity (always on)', () => {
  const questions = parseGroundTruth(readFileSync(gtPath, 'utf8'));

  it('finds the full corpus (Q1–Q7 + B1–B4, B6–B23; B5 removed)', () => {
    const qids = questions.map((q) => q.qid);
    expect(qids).toHaveLength(29);
    expect(qids).toContain('Q5');
    expect(qids).toContain('B1');
    expect(qids).toContain('B23');
    expect(qids).not.toContain('B5');
  });

  it('extracts known anchor lists correctly', () => {
    const q5 = questions.find((q) => q.qid === 'Q5')!;
    for (const id of ['92', '94', '22', '99', '104']) expect(q5.expectSurfaced).toContain(id);
    const b4 = questions.find((q) => q.qid === 'B4')!;
    for (const id of ['103', '105', '107', '108', '109', '76']) expect(b4.expectSurfaced).toContain(id);
    expect(b4.solutionUses).toContain('69');
  });

  it('filters measurement prose (degrees, ratios) out of id lists', () => {
    expect(extractIds('104 (the moment "∠ACD = 90°" is stated)')).toEqual(['104']);
    expect(extractIds('centroid 2:1 split → 17 (key)')).toEqual(['17']);
    expect(extractIds('A4 tangent–secant power — Appendix (O), never')).toEqual(['A4']);
  });

  it('every extracted id is a real 07 id (no prose noise reaches the report)', () => {
    for (const q of questions) {
      for (const id of [...q.expectSurfaced, ...q.solutionUses, ...q.mustNotSurface]) {
        expect(THEOREM_COVERAGE[id], `${q.qid} pulled non-catalog id "${id}"`).toBeDefined();
      }
    }
  });
});

it.skipIf(!process.env.THEOREM_FREQ_OUT)('write the fill-order report', () => {
  const questions = parseGroundTruth(readFileSync(gtPath, 'utf8'));

  interface Row {
    id: string;
    expectQs: string[];
    solutionQs: string[];
    disposition: string;
  }
  const rows = new Map<string, Row>();
  const rowOf = (id: string): Row => {
    let r = rows.get(id);
    if (!r) {
      const d = dispositionOf(id)!;
      r = { id, expectQs: [], solutionQs: [], disposition: d.kind === 'planned' ? d.slice : d.kind };
      rows.set(id, r);
    }
    return r;
  };
  for (const q of questions) {
    for (const id of q.expectSurfaced) rowOf(id).expectQs.push(q.qid);
    for (const id of q.solutionUses) rowOf(id).solutionQs.push(q.qid);
  }

  const absent = [...rows.values()].filter((r) => dispositionOf(r.id)?.kind !== 'tabled');
  // Rank: expectSurfaced demand first (the feed SHOULD show it), then solution use, then id.
  absent.sort(
    (a, b) => b.expectQs.length - a.expectQs.length || b.solutionQs.length - a.solutionQs.length || a.id.localeCompare(b.id, undefined, { numeric: true }),
  );

  const lines = [
    '# T2 fill order — measured corpus demand for the ABSENT theorem ids',
    '',
    `_Generated from theorem-ground-truth.md (25 reviewed questions) by fill-order.test.ts._`,
    '_Authoring aid only (docs/18 §4/D3) — the `planned` slice tags in coverage.ts follow this ranking;_',
    '_no runtime score exists or should. Regenerate after corpus edits:_',
    '_`THEOREM_FREQ_OUT=reports/theorem-fill-order.md npx vitest run src/theorems/__tests__/fill-order.test.ts`_',
    '',
    '| id | disposition | expectSurfaced demand | solutionUses demand | questions (expect) | questions (solution) |',
    '|---|---|---|---|---|---|',
    ...absent.map(
      (r) =>
        `| ${r.id} | ${r.disposition} | ${r.expectQs.length} | ${r.solutionQs.length} | ${r.expectQs.join(' ') || '—'} | ${r.solutionQs.join(' ') || '—'} |`,
    ),
    '',
    '## Absent ids with ZERO measured corpus demand (still dispositioned — fill last, or on operator call)',
    '',
    Object.entries(THEOREM_COVERAGE)
      .filter(([id, d]) => d.kind !== 'tabled' && !rows.has(id))
      .map(([id, d]) => `${id} (${d.kind === 'planned' ? d.slice : d.kind})`)
      .join(' · '),
    '',
    '## Tabled ids, for contrast (already surfaceable)',
    '',
    '| id | expect | solution |',
    '|---|---|---|',
    ...[...rows.values()]
      .filter((r) => dispositionOf(r.id)?.kind === 'tabled')
      .sort((a, b) => b.expectQs.length - a.expectQs.length)
      .map((r) => `| ${r.id} | ${r.expectQs.length} | ${r.solutionQs.length} |`),
    '',
  ];
  const out = resolve(here, '../../../', process.env.THEOREM_FREQ_OUT!);
  writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`wrote ${absent.length} absent-id rows → ${out}`);
  expect(absent.length).toBeGreaterThan(0);
});
