/**
 * #2108 ([ADR-AG-300](../../docs/06c-decisions-analytic.md#adr-ag-300)) — THE PLURAL CIRCLE SUBJECT CROSSES.
 *
 * Operator ruling, 2026-10-15 (decisions ballot, card 1, row #2108, Accept at P3): *"analytic builds «המעגלים O ו-P
 * נחתכים בנקודות X ו-Y» after two radius-only circles, as 2-D does."*
 *
 * The radii were never the trigger: the crossing family had no reader for the PLURAL subject («(שני) המעגלים (O ו-P)»,
 * "circles O and P"), so `bothCrossings` split «המעגלים O ו-P» at its «ו-» and refused the operand «המעגלים O»
 * `bad-operand` — in every context, the empty figure included. The tangency family already read that subject through
 * `readCircleSubject`; the crossing now reads it through the same reader and lowers through the one two-circle
 * crossing (`twoCircleCrossing`, ADR-AG-219's `circles-about`). 2-D (measured at `de7c221f`) builds every row below.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import saved from './fixtures/issue-2108-plural-circle-crossing.analytic.json';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);

type Pt = { id: string; x: number; y: number };
type Built = { ok: true; pts: Pt[]; faults: unknown[]; lines: string[] } | { ok: false; line: string; key?: string };

/** The REAL app door: every line through `decideSubmit`, recorded as the student's Enter records it. */
function build(lines: readonly string[], seed = 0): Built {
  const acc: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as { kind: string; line?: string; error?: { key?: string } };
    if (v.kind !== 'record') return { ok: false, line, key: v.error?.key };
    acc.push(v.line ?? line);
  }
  const d = derive(acc, seed);
  return { ok: true, pts: d.figure.points as Pt[], faults: d.faults, lines: acc };
}

function built(lines: readonly string[], seed = 0): Extract<Built, { ok: true }> {
  const b = build(lines, seed);
  if (!b.ok) throw new Error(`refused at «${b.line}» (${b.key})`);
  expect(b.faults).toEqual([]);
  return b;
}

const at = (b: { pts: Pt[] }, id: string): Pt => {
  const p = b.pts.find((q) => q.id === id);
  expect(p, `${id} missing`).toBeDefined();
  return p!;
};
const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);

/** X and Y are two DISTINCT crossings, each on circle O (radius rO) and circle P (radius rP). */
function expectCrossings(b: { pts: Pt[] }, x: string, y: string, rO?: number, rP?: number) {
  const O = at(b, 'O');
  const P = at(b, 'P');
  const X = at(b, x);
  const Y = at(b, y);
  expect(dist(X, Y)).toBeGreaterThan(1e-3);
  expect(Math.abs(dist(O, X) - dist(O, Y))).toBeLessThan(1e-6);
  expect(Math.abs(dist(P, X) - dist(P, Y))).toBeLessThan(1e-6);
  if (rO !== undefined) expect(dist(O, X)).toBeCloseTo(rO, 6);
  if (rP !== undefined) expect(dist(P, X)).toBeCloseTo(rP, 6);
}

const RADII = ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2'];

describe('#2108 (a) — the operator’s exact sequence records, and the radii stay 3 and 2', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const b = built([...RADII, 'המעגלים O ו-P נחתכים בנקודות X ו-Y'], seed);
    expectCrossings(b, 'X', 'Y', 3, 2);
  });
});

describe('#2108 — the saved question (the regression lock) builds green and verifies', () => {
  it('the fixture records line by line, X and Y on both circles, radii 3 and 2', () => {
    const b = built(saved.lines, saved.seed);
    expect(b.lines).toEqual(saved.lines);
    expectCrossings(b, 'X', 'Y', 3, 2);
  });
});

describe('#2108 (b) — every member of the class builds, as in 2-D', () => {
  it('free circles «מעגל O» · «מעגל P»', () => {
    expectCrossings(built(['מעגל O', 'מעגל P', 'המעגלים O ו-P נחתכים בנקודות X ו-Y']), 'X', 'Y');
  });

  it('the empty figure draws both circles first', () => {
    const b = built(['המעגלים O ו-P נחתכים בנקודות X ו-Y']);
    expectCrossings(b, 'X', 'Y');
  });

  it('other letters «בנקודות A ו-B»', () => {
    expectCrossings(built([...RADII, 'המעגלים O ו-P נחתכים בנקודות A ו-B']), 'A', 'B', 3, 2);
  });

  it('letterless: the crossings take the tool letters A, B', () => {
    expectCrossings(built([...RADII, 'המעגלים O ו-P נחתכים']), 'A', 'B', 3, 2);
  });

  it('letterless beside an existing A: the crossings are B and C', () => {
    const b = built(['נקודה A', 'מעגל O', 'מעגל P', 'המעגלים O ו-P נחתכים']);
    expectCrossings(b, 'B', 'C');
  });

  it.each([
    ['«O וP»', 'המעגלים O וP נחתכים בנקודות X ו-Y'],
    ['«נפגשים»', 'המעגלים O ו-P נפגשים בנקודות X ו-Y'],
    ['«זה עם זה»', 'המעגלים O ו-P נחתכים זה עם זה בנקודות X ו-Y'],
    ['contextual «שני המעגלים»', 'שני המעגלים נחתכים בנקודות X ו-Y'],
    ['contextual «המעגלים»', 'המעגלים נחתכים בנקודות X ו-Y'],
  ])('%s', (_name, line) => {
    expectCrossings(built([...RADII, line]), 'X', 'Y', 3, 2);
  });

  it('English "circles O and P intersect at X and Y"', () => {
    const b = built(['circle O with radius 3', 'circle P with radius 2', 'circles O and P intersect at X and Y']);
    expectCrossings(b, 'X', 'Y', 3, 2);
  });
});

describe('#2108 (c) — the plural subject and the singular-joined subject are one figure', () => {
  it.each([0, 1, 2, 3])('seed %i', (seed) => {
    const plural = built([...RADII, 'המעגלים O ו-P נחתכים בנקודות X ו-Y'], seed);
    const singular = built([...RADII, 'מעגל O ומעגל P נחתכים בנקודות X ו-Y'], seed);
    for (const id of ['O', 'P', 'X', 'Y']) expect(dist(at(plural, id), at(singular, id))).toBeLessThan(1e-9);
  });
});

describe('#2108 (d) — refusals stay refusals', () => {
  it('one circle named twice is refused repeated-vertex', () => {
    expect(build([...RADII, 'המעגלים O ו-O נחתכים בנקודות X ו-Y'])).toMatchObject({ ok: false, key: 'repeated-vertex' });
  });
  it('one crossing named twice is refused repeated-vertex', () => {
    expect(build([...RADII, 'המעגלים O ו-P נחתכים בנקודות X ו-X'])).toMatchObject({ ok: false, key: 'repeated-vertex' });
  });
  it('two TANGENT circles have no two crossings (the parity row circles-tangent-then-cross-2080)', () => {
    expect(build(['מעגל O', 'מעגל P', 'המעגלים O ו-P משיקים', 'המעגלים O ו-P נחתכים בנקודות X ו-Y'])).toMatchObject({ ok: false });
  });
  it('circles 3 and 2 five apart touch, so they do not cross (the parity row tangent-by-lengths-cross-2083)', () => {
    expect(build([...RADII, 'OP = 5', 'המעגלים O ו-P נחתכים בנקודות X ו-Y'])).toMatchObject({ ok: false });
  });
});

describe('#2108 (e) — controls, unchanged', () => {
  it.each([
    'מעגל O ומעגל P נחתכים בנקודות X ו-Y',
    'מעגל O חותך את מעגל P בנקודות X ו-Y',
    'X ו-Y נקודות החיתוך של מעגל O עם מעגל P',
  ])('the singular spelling «%s»', (line) => {
    expectCrossings(built([...RADII, line]), 'X', 'Y', 3, 2);
  });

  it('the plural tangency «המעגלים O ו-P משיקים» still builds', () => {
    const b = built([...RADII, 'המעגלים O ו-P משיקים']);
    expect(dist(at(b, 'O'), at(b, 'P'))).toBeGreaterThan(0);
  });

  it('the indefinite «שני מעגלים נחתכים בנקודות X ו-Y» still draws two new circles', () => {
    const b = built(['שני מעגלים נחתכים בנקודות X ו-Y']);
    expect(b.pts.map((p) => p.id).sort()).toEqual(['X', 'Y']);
  });
});
