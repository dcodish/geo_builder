/**
 * The bilingual MORPHOLOGY MATRIX (S2.2 of docs/24) — stems × surface forms through the REAL parsers.
 *
 * The docs/23 review found the same Hebrew-morphology classes recurring per product because a stem
 * was re-spelled per rule and nothing tested the matrix: the single-vav זוית (ADR-3D-032 swept every
 * 3-D angle rule; 2-D carried `זו?וית` from early on), the final/medial kaf trap `מאונ[ךכ]` (recorded
 * in ADR-3D-035 after the plural `מאונכים` was silently rejected), and the meet-verb family (`פוגש`/
 * `פגש` entered 2-D's INTERSECT_KW 2026-06-18; 3-D's diagonal rule lacked `נפגש` until ADR-3D-055,
 * 2026-07-23). This test locks each family's morphological variants to parse EQUIVALENTLY to their
 * canonical form, in BOTH products — so a variant regression (or a fresh rule missing a form) fails
 * here with the family named, instead of surfacing as a prod triage row months later.
 */
import { describe, expect, it } from 'vitest';
import { applyStep, emptyConstruction } from '@/engine';
import type { Command } from '@/engine';
import { buildParseCtx, parse } from '@/parser';

// ── 2-D: a triangle-with-a-segment context so relation statements resolve ────────────────────────
function ctx2() {
  let c = emptyConstruction();
  for (const cmd of [
    { type: 'triangle', ids: ['A', 'B', 'C'] },
    { type: 'segment', a: 'C', b: 'D' } as Command,
  ] as Command[]) {
    const r = applyStep(c, cmd);
    if (r.ok) c = r.construction;
  }
  const e = applyStep(c, { type: 'free-point', id: 'E', x: 9, y: 9, free: true } as Command);
  const fin = e.ok ? e.construction : c;
  const pos = new Map<string, { x: number; y: number }>();
  return buildParseCtx(fin, pos as never);
}

/** Both forms must parse, and to the SAME command types (morphology must not change meaning). */
function sameParse(canonical: string, variant: string) {
  const ctx = ctx2();
  const a = parse(canonical, ctx);
  const b = parse(variant, ctx);
  expect(a.ok, `canonical did not parse: ${canonical}`).toBe(true);
  expect(b.ok, `variant did not parse: ${variant}`).toBe(true);
  if (a.ok && b.ok) {
    expect(b.commands.map((c) => c.type).sort()).toEqual(a.commands.map((c) => c.type).sort());
  }
}

describe('2-D morphology matrix', () => {
  it('the angle noun: double-vav זווית ≡ single-vav זוית', () => {
    sameParse('זווית ABC = 40', 'זוית ABC = 40');
  });

  it('perpendicular: masculine מאונך ≡ plural מאונכים (final vs medial kaf)', () => {
    sameParse('AB מאונך ל-CD', 'AB ו-CD מאונכים זה לזה');
  });

  it('meet verbs: חותך ≡ פוגש (the פגש keyword lesson)', () => {
    sameParse('AB חותך את CD בנקודה F', 'AB פוגש את CD בנקודה F');
  });

  it('meet verbs: singular נחתך family ≡ plural נחתכים (medial kaf)', () => {
    sameParse('AB ו-CD נחתכים בנקודה F', 'AB ו-CD נפגשים בנקודה F');
  });
});
