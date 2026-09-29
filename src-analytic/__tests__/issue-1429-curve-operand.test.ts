/**
 * ONE CURVE-OPERAND RESOLVER (#1429, ADR-AG-168) — «which curve does this name» answered once.
 *
 * External review of prod (relayed 2026-09-27): *"No point on a named circle. «P על המעגל I»
 * fails, although «הנקודה P נמצאת על המעגל» works"* and *"the canvas even marks the intersections,
 * but you can't name them."* Three hand-written resolvers each knew a different subset; the
 * measured table below is the issue's own, locked spelling by spelling through the real
 * `parse → derive` path. The equation-identity arm (ADR-AG-023/#1342): an operand written as an
 * equation resolves to the EXISTING curve carrying that equation, and `curve-anon…` never reaches
 * a refusal (#1145's class).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

const CIRCLE = 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9';
const CIRCLE2 = 'נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1';
const L1 = 'נתון הישר l1: y=4';
const L2 = 'נתון הישר l2: y=x';

const curveIds = (d: ReturnType<typeof derive>) =>
  d.construction.objects.filter((o) => ['curve', 'circle-at', 'line-at', 'circle-thru'].includes(o.kind)).map((o) => o.id);

describe('#1429 — a point on a NAMED circle, every spelling', () => {
  it.each([
    'P על המעגל I',
    'P על מעגל I',
    'נקודה P על המעגל I',
    'הנקודה P נמצאת על המעגל I',
    'P on circle I',
    'P על המעגל 1',
  ])('«%s» builds onto circle-I', (line) => {
    const d = derive([CIRCLE, line], 0);
    expect(d.faults).toEqual([]);
    // On THE named circle — not a second curve minted beside it (ADR-AG-023).
    expect(curveIds(d)).toEqual(['circle-I']);
  });

  it('two circles: «P על המעגל II» lands on II; the contextual «P על המעגל» stays ambiguous', () => {
    const named = derive([CIRCLE, CIRCLE2, 'P על המעגל II'], 0);
    expect(named.faults).toEqual([]);
    const p = named.figure.points.find((q) => q.id === 'P')!;
    expect(Math.hypot(p.x + 5, p.y - 2)).toBeCloseTo(1, 4);
    const ctx = derive([CIRCLE, CIRCLE2, 'P על המעגל'], 0);
    expect(ctx.faults.map((f) => f.code)).toEqual(['ambiguous-curve']);
  });
});

describe('#1429 — the crossing sentence, every spelling of the issue table', () => {
  it.each([
    [['E נקודת החיתוך של הישר l1 ו-l2'], 'clitic, dash, no space'],
    [['E נקודת החיתוך של הישר l1 והישר l2'], 'clitic attached to the noun'],
    [['E נקודת החיתוך של הישרים l1 ו-l2'], 'distributive plural'],
    [['E נקודת החיתוך של הישרים'], 'bare plural — M1 resolves the exactly-two'],
    [['E חיתוך הישרים l1 ו-l2'], 'short form'],
    [['הישרים l1 ו-l2 נחתכים בנקודה E'], 'plural verb subject'],
    [['הישר l1 חותך את הישר l2 בנקודה E'], 'transitive verb'],
  ])('%s builds E at (4,4) — %s', (lines) => {
    const d = derive([L1, L2, ...lines], 0);
    expect(d.faults).toEqual([]);
    const e = d.figure.points.find((q) => q.id === 'E')!;
    expect(e.x).toBeCloseTo(4, 4);
    expect(e.y).toBeCloseTo(4, 4);
  });

  it('«A נקודת החיתוך של הישר l1 עם המעגל» — the contextual circle operand resolves like «P על המעגל»', () => {
    const d = derive([L1, CIRCLE, 'A נקודת החיתוך של הישר l1 עם המעגל'], 0);
    expect(d.faults).toEqual([]);
    const a = d.figure.points.find((q) => q.id === 'A')!;
    expect(Math.hypot(a.x - 3, a.y - 4)).toBeCloseTo(3, 4);
    expect(Math.abs(a.y - 4)).toBeLessThan(1e-6);
  });

  it('the bare plural with three lines is ambiguous, never a guess', () => {
    const d = derive([L1, L2, 'נתון הישר l3: y=-x', 'E נקודת החיתוך של הישרים'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['ambiguous-shape']);
  });
});

describe('#1429 — the equation-identity arm (ADR-AG-023/#1342)', () => {
  it('«…עם המעגל (x-3)^2+(y-4)^2=9» beside NAMED circle I is a reference to I — no second curve', () => {
    const d = derive([L1, CIRCLE, 'A נקודת החיתוך של הישר l1 עם המעגל (x-3)^2+(y-4)^2=9'], 0);
    expect(d.faults).toEqual([]);
    expect(curveIds(d).sort()).toEqual(['circle-I', 'line-l1']);
  });

  it('with no existing match the curve is minted stated:false and the sentence builds', () => {
    const d = derive([L1, 'A נקודת החיתוך של הישר l1 עם המעגל x^2+y^2=25'], 0);
    expect(d.faults).toEqual([]);
    expect(curveIds(d)).toHaveLength(2);
  });

  it('«B על הישר y=x» beside the stated l2: y=x puts B ON l2 — the point-on sentence, same identity', () => {
    const d = derive([L2, 'B על הישר y=x'], 0);
    expect(d.faults).toEqual([]);
    expect(curveIds(d)).toEqual(['line-l2']);
  });

  it('no refusal ever prints a curve-anon id (#1145): the unknown-name case names the STUDENT’s name', () => {
    const d = derive(['מעגל M משיק לישר l7'], 0);
    expect(d.faults.map((f) => `${f.code}:${(f as { detail?: string }).detail ?? ''}`).join('|')).not.toContain('curve-anon');
  });
});

describe('#1429 — refusals and prior rulings unchanged', () => {
  it('«P נקודת החיתוך של הישר AB עם הישר BC» still refuses crossing-already-named (#1175)', () => {
    const d = derive(['משולש ABC', 'P נקודת החיתוך של הישר AB עם הישר BC'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['crossing-already-named']);
  });

  it('«הישר AB עם הישר BA» still refuses self-crossing (#1255)', () => {
    const d = derive(['A(0,0)', 'B(4,0)', 'P נקודת החיתוך של הישר AB עם הישר BA'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['self-crossing']);
  });

  it('an ORDINAL over a contextual operand is refused, never silently unordered', () => {
    const d = derive([L1, CIRCLE, 'A נקודת החיתוך הראשונה של הישר l1 עם המעגל'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['bad-operand']);
  });
});
