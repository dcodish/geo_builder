/**
 * #2171 / #2180 ([ADR-3D-345](../../docs/06b-decisions-3d.md#adr-3d-345), [ADR-3D-346](../../docs/06b-decisions-3d.md#adr-3d-346),
 * ADR-W-131) — TWO SHAPE NOUNS ON ONE QUADRILATERAL GET 2-D'S ANSWER IN 3-D, from the one shared relation.
 *
 * Measured at ef78f15c through `decideSubmit3` → `derive3`: «טרפז ABCD» · «טרפז שווה שוקיים ABCD» built the right shape
 * but told the student the line «adds no new information» (3-D's copy of the hierarchy had no adjectives, so it read
 * as implied); «טרפז שווה שוקיים ABCD» · «טרפז ישר זווית ABCD» drew a rectangle with the amber warning and the same false
 * note; the six sibling pairs («מלבן» · «מעוין») built silently; a third «ריבוע» after «מלבן» · «מעוין» recorded a row.
 *
 * The thin lock runs the shared rows (`shell/__tests__/fixtures/quad-noun-pairs.ts`) through the REAL submit decision
 * (`decideSubmit3`) and the real notices (`derive3`, worded by `narrowingText3` / `errorText3` in the real i18n). Any
 * «adds nothing» notice (`already-known`) is reported as a note, so a row expecting none fails on it.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { errorText3 } from '../i18n/errorText3';
import { narrowingText3 } from '../i18n/narrowingText3';
import { declaredKind3 } from '../engine/baseShapes';
import i18n3d from '../i18n';
import type { NarrowTranslate } from '../../shell/narrowing';
import { ringKinds } from '../../shell/narrowing';
import { pairFaults, type PairGate } from '../../shell/__tests__/fixtures/quad-noun-pairs';

const plain = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');
const t = i18n3d.getFixedT('he') as unknown as NarrowTranslate;

type St = { facts: Fact3[]; seed: number };

function play(steps: readonly string[]): { st: St; last: 'restates' | 'refines' | 'refused'; refusal?: string; earlierAccepted: boolean } {
  let st: St = { facts: [], seed: 0 };
  let n = 0;
  let earlierAccepted = true;
  let out: { last: 'restates' | 'refines' | 'refused'; refusal?: string } = { last: 'restates' };
  steps.forEach((line, i) => {
    const v = decideSubmit3(st, line, () => `f${++n}`);
    if (v.kind === 'record') {
      st = { facts: v.facts, seed: v.seed };
      out = { last: 'refines' };
    } else if (v.kind === 'already-stated') out = { last: 'restates' };
    else {
      out = { last: 'refused', refusal: v.kind === 'refused' ? plain(errorText3(t as never, v.error) ?? '') : v.kind };
      if (i < steps.length - 1) earlierAccepted = false;
    }
  });
  return { st, ...out, earlierAccepted };
}

const notesOf = (st: St): string[] =>
  derive3(st.facts, st.seed).notices.flatMap((x) => (x.kind === 'narrowed' ? [plain(narrowingText3(x.note, t))] : x.kind === 'already-known' ? [`already-known: ${x.subject}`] : []));

const gate: PairGate = (steps) => {
  const { st, ...v } = play(steps);
  return { ...v, notes: notesOf(st) };
};

describe('#2171 — every two-noun pair (and the three-noun rows) gets 2-D’s answer in 3-D', () => {
  it('every row of quad-noun-pairs', async () => {
    expect(await pairFaults(gate, '3d')).toEqual([]);
  }, 600_000);
});

describe('#2171 — a trapezoid adjective after «טרפז» narrows the ring, and the figure keeps the adjective', () => {
  // The adjective's own lowering is unchanged by #2171 (the line used to take the redundant path, which lowered nothing
  // more either). Measured identically before and after: 23/24 seeds draw an isosceles trapezoid, and seed 16 draws a
  // rectangle WITH the amber «no longer a trapezoid» warning — never green (found work, filed needs-operator).
  it('«טרפז ABCD» · «טרפז שווה שוקיים ABCD» is an isosceles trapezoid at 24 seeds (or amber), with no «adds nothing» notice', () => {
    const { st } = play(['טרפז ABCD', 'טרפז שווה שוקיים ABCD']);
    expect(notesOf(st)).toEqual([]);
    let iso = 0;
    for (let seed = 0; seed < 24; seed++) {
      const d = derive3(st.facts, seed);
      const pts = ['A', 'B', 'C', 'D'].map((id) => d.positions.get(id)!);
      expect(pts.every(Boolean), `seed ${seed}`).toBe(true);
      if (ringKinds(pts.map((p) => [p.x, p.y, p.z])).has('isosceles-trapezoid')) iso++;
      else expect(d.shapeWarnings.map((w) => (w as { kind: string }).kind), `seed ${seed}: not drawn green`).toContain('trapezoid-morph');
    }
    expect(iso).toBeGreaterThanOrEqual(23);
  }, 120_000);

  it('«טרפז ABCD» · «טרפז ישר זווית ABCD» is a right trapezoid at 24 seeds, with no «adds nothing» notice', () => {
    const { st } = play(['טרפז ABCD', 'טרפז ישר זווית ABCD']);
    expect(notesOf(st)).toEqual([]);
    for (let seed = 0; seed < 24; seed++) {
      const d = derive3(st.facts, seed);
      const pts = ['A', 'B', 'C', 'D'].map((id) => d.positions.get(id)!);
      expect(ringKinds(pts.map((p) => [p.x, p.y, p.z])).has('right-trapezoid'), `seed ${seed}`).toBe(true);
    }
  }, 120_000);

  it('«ריבוע ABCD» · «מלבן ABCD» still says «adds nothing» (an implied noun is redundant)', () => {
    const { st, last } = play(['ריבוע ABCD', 'מלבן ABCD']);
    expect(last).toBe('restates');
    expect(st.facts).toHaveLength(1);
  });
});

describe('#2171 — the exclusion names the declared adjective (ruling 2026-10-16), every reading and spelling', () => {
  const EXCL = (actual: string, stated: string) => `הצורה כבר ידועה כ־${actual} — ולכן אינה נקראת ${stated}. מחקו את הנתון הקודם אם התכוונתם ${stated}.`;
  it.each([
    [['טרפז שווה שוקיים ABCD', 'טרפז ישר זווית BCDA'], EXCL('טרפז שווה שוקיים', 'טרפז ישר זווית')],
    [['isosceles trapezoid ABCD', 'right trapezoid ABCD'], EXCL('טרפז שווה שוקיים', 'טרפז ישר זווית')],
    [['דלתון ABCD', 'טרפז BCDA'], EXCL('דלתון', 'טרפז')],
    [['kite ABCD', 'trapezoid ABCD'], EXCL('דלתון', 'טרפז')],
    [['מלבן ABCD', 'מעוין ABCD', 'טרפז ABCD'], EXCL('ריבוע', 'טרפז')],
  ])('«%s»', (steps, sentence) => {
    const v = play(steps);
    expect(v.earlierAccepted).toBe(true);
    expect(v.last).toBe('refused');
    expect(v.refusal).toBe(sentence);
  }, 120_000);
});

describe('#2180 — a third noun after a sibling merge is the same statement', () => {
  it.each([
    [['מלבן ABCD', 'מעוין ABCD', 'ריבוע ABCD']],
    [['מקבילית ABCD', 'דלתון ABCD', 'מעוין ABCD']],
    [['מלבן ABCD', 'מעוין ABCD', 'ריבוע BCDA']],
    [['מלבן ABCD', 'דלתון ABCD', 'ריבוע ABCD']],
  ])('«%s» adds no row', (steps) => {
    const v = play(steps);
    expect(v.last).toBe('restates');
    expect(v.st.facts).toHaveLength(2);
  }, 120_000);

  it('a muted sibling does not count: «מלבן» · «מעוין» (muted) · «ריבוע» records the square', () => {
    const { st } = play(['מלבן ABCD', 'מעוין ABCD']);
    const muted = { ...st, facts: st.facts.map((f, i) => (i === 1 ? { ...f, enabled: false } : f)) };
    const v = decideSubmit3(muted, 'ריבוע ABCD', () => 'fx');
    expect(v.kind).toBe('record');
  }, 120_000);
});

describe('#2171 — the declared kind keeps the adjective', () => {
  it('declaredKind3', () => {
    expect(declaredKind3({ base: 'trapezoid', adj: 'isosceles' })).toBe('isosceles-trapezoid');
    expect(declaredKind3({ base: 'trapezoid', adj: 'right' })).toBe('right-trapezoid');
  });
});
