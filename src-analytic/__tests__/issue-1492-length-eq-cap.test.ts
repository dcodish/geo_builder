/**
 * #1492 ([ADR-AG-231](../../docs/06c-decisions-analytic.md#adr-ag-231)) — A RELATIVE RESIDUAL HAS NO ZERO AT INFINITY,
 * AND A REFUSAL NAMES THE STATEMENT THAT COMPLETED THE CONTRADICTION.
 *
 * The operator's kite (prod session `j73pikxb`): `CB = CD` was normalised by `max(1, |l|, |r|)`. For C sliding out along
 * its line the numerator tends to a constant while the denominator grows without bound, so the residual tends to 0 and
 * the descent followed it — C = (−3081, 6179) at 4 of 24 raw seeds, the kite whole at 13/24 (11/24 with the circle
 * through A, B, D). Ruled 2026-09-29 (variant C): the operand normaliser is capped at the figure's span, and #1334's blame
 * is rebuilt as a drop-one conflict probe so it does not depend on the basin the cap moved.
 *
 * Measured at the fix (baseline → after, raw `evaluate` over seeds 0–23): kite 13 → 23, kite + circle 11 → 21.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { completingStatement, evaluate, residualScale } from '../engine/evaluate';
import { parseLengthExpr } from '../engine/lengths';
import { residualRows, type Constraint } from '../engine/solve';
import type { Pt } from '../engine/derived';

const KITE = ['דלתון ABCD', 'AB=AD', 'CB=CD', 'A(1,7)', 'משוואת הקטע BD היא y=x', 'נקודה C נמצאת על הישר y=-2x+17', 'AB=6'];
const CIRCLE = ['נתון מעגל O', 'A על המעגל', 'B על המעגל', 'D על המעגל'];

const rawWhole = (lines: string[]) => {
  const c = derive(lines, 0).construction;
  let whole = 0;
  let farthest = 0;
  for (let s = 0; s < 24; s += 1) {
    const f = evaluate(c, s);
    if (f.unsatisfied.length > 0 || f.ringFaults.length > 0 || !f.selectorsOk) continue;
    whole += 1;
    const C = f.points.find((p) => p.id === 'C');
    if (C) farthest = Math.max(farthest, Math.hypot(C.x, C.y));
  }
  return { whole, farthest };
};

const lengthEq = (l: string, r: string): Constraint => ({ t: 'length-eq', left: parseLengthExpr(l)!, right: parseLengthExpr(r)! });
const at = (pts: Record<string, Pt>) => (id: string) => pts[id] ?? null;
const row = (k: Constraint, pts: Record<string, Pt>, scale?: number) => residualRows(k, at(pts), {}, undefined, undefined, scale)!.eq[0];

describe('#1492 — the operator’s kite, raw, over 24 seeds', () => {
  it('the kite is whole at ≥ 21/24 raw seeds (13 before), and no whole seed holds a runaway C', () => {
    const { whole, farthest } = rawWhole(KITE);
    expect(whole).toBeGreaterThanOrEqual(21);
    expect(farthest).toBeLessThan(100);
  });

  it('with the circle through A, B, D: ≥ 20/24 (11 before)', () => {
    expect(rawWhole([...KITE, ...CIRCLE]).whole).toBeGreaterThanOrEqual(20);
  });

  it('the page’s own path builds both figures green', () => {
    expect(derive(KITE, 0).faults).toEqual([]);
    expect(derive([...KITE, ...CIRCLE], 0).faults).toEqual([]);
  });
});

describe('#1492 — the `length-eq` row: capped above the span, scale-free below it', () => {
  // C on the kite's line y = −2x + 17, B and D on y = x.
  const B = { x: 7, y: 7 };
  const D = { x: 1, y: 1 };
  const onLine = (x: number) => ({ x, y: -2 * x + 17 });
  const k = lengthEq('CB', 'CD');

  it('uncapped, the row has a zero at infinity — the class — and capped it does not', () => {
    const far = { B, D, C: onLine(-3000) };
    const farther = { B, D, C: onLine(-300000) };
    // The operand normaliser alone: the far field reads ever closer to "satisfied".
    expect(Math.abs(row(k, farther))).toBeLessThan(Math.abs(row(k, far)) / 50);
    // Capped at a span of 6: the far field keeps a residual of the order of the projection over the span.
    expect(Math.abs(row(k, farther, 6))).toBeGreaterThan(0.1);
    expect(row(k, farther, 6)).toBeCloseTo(row(k, far, 6), 2);
  });

  it('below the span the row is exactly the operand-normalised one — a ratio contradiction stays scale-free', () => {
    const k2 = lengthEq('AB', '2BC');
    for (const s of [1.5, 2, 3]) {
      const sq = { A: { x: 0, y: 0 }, B: { x: s, y: 0 }, C: { x: s, y: s } };
      expect(row(k2, sq, 6)).toBeCloseTo(row(k2, sq), 12);
      expect(row(k2, sq, 6)).toBeCloseTo(-0.5, 12); // the same at every size: no shrink gradient
    }
  });

  it('an equation of AREAS is capped at span², its own dimension', () => {
    const k3: Constraint = { t: 'length-eq', left: parseLengthExpr('שטח המשולש ABC')!, right: parseLengthExpr('שטח המשולש ABD')! };
    const pts = { A: { x: 0, y: 0 }, B: { x: 4, y: 0 }, C: { x: 0, y: 5 }, D: { x: 0, y: 4 } }; // areas 10 and 8
    expect(row(k3, pts, 6)).toBeCloseTo(row(k3, pts), 12); // 10 < 36: uncapped
    expect(row(k3, pts, 3)).toBeCloseTo((10 - 8) / 9, 12); // 10 > 9: capped at 3²
  });

  it('the scale is read off the STATED figure — the free vertices never move it', () => {
    const c = derive(KITE, 0).construction;
    expect(residualScale(c, {})).toBe(6); // A(1,7) alone: the arena's floor
    expect(residualScale(derive(['A(0,0)', 'B(40,0)'], 0).construction, {})).toBe(40);
  });

  it('a figure measured in THOUSANDS still converges — the cap follows the figure', () => {
    const d = derive(['A(0,0)', 'B(4000,0)', 'נקודה M', 'MA = MB'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.points.find((p) => p.id === 'M')!.x).toBeCloseTo(2000, 3);
  });
});

describe('#1492 — variant A’s collapse stays refused (ruling 4)', () => {
  it('«ריבוע ABCD» · «AB = 2BC» is refused at every seed, on the statement that completed the contradiction', () => {
    for (let seed = 0; seed < 4; seed += 1) {
      const d = derive(['ריבוע ABCD', 'AB = 2BC'], seed);
      expect(d.faults.map((f) => `${f.code}@${f.index}`), `seed ${seed}`).toEqual(['unsatisfiable@1']);
    }
  });
});

describe('#1492 — blame is a drop-one probe (ruling 3)', () => {
  it('the needle: the newest statement whose removal admits a figure', () => {
    const d = derive(['משולש ABC', 'AB = AC', '∠ABC = 90'], 0);
    expect(completingStatement(d.construction, d.constraintLine, 0)).toBe(2);
  });

  it('a statement that PINS a point is a statement too: «O(0,0)» on the circle through A, B, D is blamed, not the incidences', () => {
    const d = derive(['A(0,4)', 'B(-3,0)', 'D(3,0)', 'נתון מעגל O', 'A על המעגל', 'B על המעגל', 'D על המעגל', 'O(0,0)'], 0);
    expect(d.faults.map((f) => `${f.code}@${f.index}`)).toEqual(['unsatisfiable@7']);
    // …and with the centre stated FIRST, the newest statement whose removal admits a figure: B and D agree on r = 3
    // about (0,0) and A alone asks for 4, so «A על המעגל» is the one to take away (dropping «D על המעגל» or «B על המעגל»
    // leaves A against the other at 4 ≠ 3).
    const e = derive(['A(0,4)', 'B(-3,0)', 'D(3,0)', 'O(0,0)', 'נתון מעגל O', 'A על המעגל', 'B על המעגל', 'D על המעגל'], 0);
    expect(e.faults.map((f) => `${f.code}@${f.index}`)).toEqual(['unsatisfiable@5']);
  });

  it('two INDEPENDENT contradictions: no single removal admits a figure, so the snapshot names both', () => {
    const lines = ['A(0,0)', 'B(3,0)', 'AB = 5', 'C(0,1)', 'D(1,1)', 'CD = 7'];
    const d = derive(lines, 0);
    expect(completingStatement(d.construction, d.constraintLine, 0)).toBeNull();
    expect(d.faults.map((f) => `${f.code}@${f.index}`).sort()).toEqual(['unsatisfiable@2', 'unsatisfiable@5']);
  });
});
