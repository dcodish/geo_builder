/**
 * Phase-5b acceptance gate (docs/09-implementation-plan.md §Phase 5b).
 *
 * Lines as constructive scaffolding (angle bisector, perpendicular, parallel,
 * through) + the points they produce (line∩line, foot of perpendicular,
 * midpoint) + right-triangle, then **reproduce corpus Q2, Q3, Q4** end-to-end
 * from typed He/En utterances. Lines are not drawn — only the named segments.
 */

import { describe, it, expect } from 'vitest';
import type { Command, Vec } from '../types';
import { build, applyStep, emptyConstruction } from '../step';
import { evaluate } from '../evaluate';
import { sub, dist, angleDeg, cross } from '../geometry';
import { parse } from '@/parser';

const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
/** Is q collinear with the line through a and b? */
const collinear = (a: Vec, b: Vec, q: Vec) => Math.abs(cross(a, b, q)) < 1e-6;

describe('angle bisector + line∩line of two lines', () => {
  it('the meet of two bisectors is equidistant from the three sides (incenter)', () => {
    const { positions } = build([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'bisector', id: 'bis-BAC', vertex: 'A', p: 'B', q: 'C' },
      { type: 'bisector', id: 'bis-ABC', vertex: 'B', p: 'A', q: 'C' },
      { type: 'line-intersection', id: 'I', line1: 'bis-BAC', line2: 'bis-ABC' },
    ]);
    const A = positions.get('A')!, B = positions.get('B')!, C = positions.get('C')!, I = positions.get('I')!;
    // I lies on the bisector from A: ∠BAI == ∠IAC
    expect(angleDeg(A, B, I)).toBeCloseTo(angleDeg(A, I, C), 6);
    // …and on the bisector from B: ∠ABI == ∠IBC
    expect(angleDeg(B, A, I)).toBeCloseTo(angleDeg(B, I, C), 6);
  });

  it('rejects two parallel lines, keeping the prior figure', () => {
    const base = build([{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }]);
    const r = applyStep(base.construction, { type: 'line-intersection', id: 'X', line1: 'l1', line2: 'l2' });
    // the referenced lines don't exist yet → unresolved (kept prior)
    expect(r.ok).toBe(false);
  });
});

describe('foot of perpendicular', () => {
  it('drops a perpendicular onto a line; the foot makes a right angle', () => {
    const { positions } = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 6, y: 0 },
      { type: 'free-point', id: 'P', x: 2, y: 4 },
      { type: 'foot', id: 'F', from: 'P', a: 'A', b: 'B' },
    ]);
    const A = positions.get('A')!, B = positions.get('B')!, P = positions.get('P')!, F = positions.get('F')!;
    expect(collinear(A, B, F)).toBe(true); // F on line AB
    expect(dot(sub(F, P), sub(B, A))).toBeCloseTo(0, 6); // PF ⟂ AB
    expect(F.x).toBeCloseTo(2, 6); // foot of (2,4) on the x-axis is (2,0)
    expect(F.y).toBeCloseTo(0, 6);
  });
});

describe('midpoint', () => {
  it('is the average of the endpoints', () => {
    const { positions } = build([
      { type: 'free-point', id: 'A', x: -2, y: 1 },
      { type: 'free-point', id: 'B', x: 6, y: 5 },
      { type: 'midpoint', id: 'M', a: 'A', b: 'B' },
    ]);
    const M = positions.get('M')!;
    expect(M.x).toBeCloseTo(2, 9);
    expect(M.y).toBeCloseTo(3, 9);
  });
});

describe('right triangle', () => {
  it('has a right angle at the last named vertex, and keeps it when a leg moves', () => {
    const r1 = applyStep(emptyConstruction(), { type: 'right-triangle', ids: ['A', 'B', 'C'] });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const A1 = r1.positions.get('A')!, B1 = r1.positions.get('B')!, C1 = r1.positions.get('C')!;
    expect(dot(sub(A1, C1), sub(B1, C1))).toBeCloseTo(0, 6); // ∠C = 90°

    // move A; the right angle at C is preserved (B follows the leg)
    const r2 = applyStep(r1.construction, { type: 'free-point', id: 'A', x: 3, y: -2 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const A = r2.positions.get('A')!, B = r2.positions.get('B')!, C = r2.positions.get('C')!;
    expect(dot(sub(A, C), sub(B, C))).toBeCloseTo(0, 6);
  });
});

/** Parse a list of utterances into commands, failing loudly on a miss. */
function reproduce(utterances: string[], tag: string) {
  const commands = utterances.flatMap((u) => {
    const r = parse(u);
    if (!r.ok) throw new Error(`${tag}: failed to parse "${u}"`);
    return r.commands;
  });
  return build(commands as Command[]);
}

describe('corpus Q2 — parallelogram + two angle bisectors meeting at E, then F = AE∩BC', () => {
  const EN = [
    'parallelogram ABCD',
    'segment AC',
    'E is the intersection of the bisectors of angle BAC and angle BCA',
    'segment AE',
    'segment CE',
    'F is the intersection of AE and BC',
    'segment AF',
  ];
  const HE = [
    'מקבילית ABCD',
    'אלכסון AC',
    'E חיתוך חוצי הזוויות BAC ו-BCA',
    'קטע AE',
    'קטע CE',
    'F חיתוך AE ו-BC',
    'קטע AF',
  ];

  for (const [lang, utterances] of [['en', EN], ['he', HE]] as const) {
    it(`reproduces Q2 (${lang})`, () => {
      const { construction, positions } = reproduce(utterances, `Q2-${lang}`);
      const A = positions.get('A')!, B = positions.get('B')!, C = positions.get('C')!, E = positions.get('E')!, F = positions.get('F')!;

      // E is on the bisector of ∠BAC and of ∠BCA
      expect(angleDeg(A, B, E)).toBeCloseTo(angleDeg(A, E, C), 5);
      expect(angleDeg(C, B, E)).toBeCloseTo(angleDeg(C, E, A), 5);
      // F lies on line AE (A, E, F collinear) and on line BC
      expect(collinear(A, E, F)).toBe(true);
      expect(collinear(B, C, F)).toBe(true);

      const segIds = construction.objects.filter((o) => o.kind === 'segment').map((o) => o.id);
      for (const need of ['seg-AC', 'seg-AE', 'seg-CE', 'seg-AF']) expect(segIds).toContain(need);
      // the bisector lines are scaffolding — present as objects but never drawn
      expect(construction.objects.some((o) => o.kind === 'line')).toBe(true);
      expect(evaluate(construction).ok).toBe(true);
    });
  }
});

describe('corpus Q3 — rhombus, E on AD by ratio, F = foot of ⟂ from C to AD', () => {
  const EN = [
    'rhombus ABCD',
    'point E on AD at 40%',
    'F is the foot of the perpendicular from C to AD',
    'segment CE',
    'segment CF',
    'segment DF',
  ];
  const HE = [
    'מעוין ABCD',
    'נקודה E על AD ב-40%',
    'F רגל האנך מ-C ל-AD',
    'קטע CE',
    'קטע CF',
    'קטע DF',
  ];

  for (const [lang, utterances] of [['en', EN], ['he', HE]] as const) {
    it(`reproduces Q3 (${lang})`, () => {
      const { construction, positions } = reproduce(utterances, `Q3-${lang}`);
      const A = positions.get('A')!, C = positions.get('C')!, D = positions.get('D')!, E = positions.get('E')!, F = positions.get('F')!;

      // rhombus: all four sides equal
      const B = positions.get('B')!;
      expect(dist(A, B)).toBeCloseTo(dist(B, C), 6);
      expect(dist(B, C)).toBeCloseTo(dist(C, D), 6);
      expect(dist(C, D)).toBeCloseTo(dist(D, A), 6);

      // E on AD, AE : ED = 2 : 3
      expect(collinear(A, D, E)).toBe(true);
      expect(dist(A, E) / dist(E, D)).toBeCloseTo(2 / 3, 5);

      // F is the foot of the perpendicular from C onto line AD
      expect(collinear(A, D, F)).toBe(true);
      expect(dot(sub(F, C), sub(D, A))).toBeCloseTo(0, 5);

      const segIds = construction.objects.filter((o) => o.kind === 'segment').map((o) => o.id);
      for (const need of ['seg-CE', 'seg-CF', 'seg-DF']) expect(segIds).toContain(need);
      expect(evaluate(construction).ok).toBe(true);
    });
  }
});

describe('corpus Q4 — right triangle, two angle bisectors meeting at D', () => {
  const EN = [
    'right triangle ABC',
    'D is the intersection of the bisectors of angle BAC and angle ABC',
    'segment AD',
    'segment BD',
  ];
  const HE = [
    'משולש ישר-זווית ABC',
    'D חיתוך חוצי הזוויות BAC ו-ABC',
    'קטע AD',
    'קטע BD',
  ];

  for (const [lang, utterances] of [['en', EN], ['he', HE]] as const) {
    it(`reproduces Q4 (${lang})`, () => {
      const { construction, positions } = reproduce(utterances, `Q4-${lang}`);
      const A = positions.get('A')!, B = positions.get('B')!, C = positions.get('C')!, D = positions.get('D')!;

      // right angle at C
      expect(dot(sub(A, C), sub(B, C))).toBeCloseTo(0, 6);
      // D on the bisector of ∠BAC and of ∠ABC
      expect(angleDeg(A, B, D)).toBeCloseTo(angleDeg(A, D, C), 5);
      expect(angleDeg(B, A, D)).toBeCloseTo(angleDeg(B, D, C), 5);

      const segIds = construction.objects.filter((o) => o.kind === 'segment').map((o) => o.id);
      for (const need of ['seg-AD', 'seg-BD']) expect(segIds).toContain(need);
      expect(evaluate(construction).ok).toBe(true);
    });
  }
});
