/**
 * #1286 ([ADR-AG-135](../../docs/06c-decisions-analytic.md#adr-ag-135)) — THE DRAWN EXTENT DECIDES WHICH
 * ROOTS EXIST, and the figure is the authority on the extent.
 *
 * Operator, 2026-09-20 (T11): *"a root outside the segment is not a lesser configuration — it is not a
 * configuration. A segment that genuinely meets the circle twice offers both."* And on the noun, ruling (a):
 * *"the figure is the authority"* — `CA` drawn as a triangle side is a segment whatever the sentence called it.
 *
 * Measured before (12 seeds each, real `derive`): «הצלע CA» reached the FAR root (−2.058, −3.430) at seed 1
 * — ADR-AG-124 had made the noun seed the root, not bound the solution set — «הישר CA» reached it at seeds
 * 0–2, and a segment that never reaches the circle drew its "crossing" at (±4, 0), beyond its own end,
 * with every row green.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { segmentParam, withinSegment, drawnPieceOver } from '../engine/extent';
import { parseLine } from '../parser/parseAnalytic';
import { fold } from '../engine/apply';
import type { Fact } from '../engine/types';

const T11 = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC', 'משוואת המעגל x^2+y^2=16'];
const P = (d: ReturnType<typeof derive>) => d.figure.points.find((p) => p.id === 'P');
const NEAR = { x: 2.058, y: 3.43 };

describe('#1286 — a root outside the drawn piece is not a configuration', () => {
  it('«הצלע CA»: the root ON the side, at every one of 12 seeds (the far root reached seed 1 before)', () => {
    for (let seed = 0; seed < 12; seed++) {
      const d = derive([...T11, 'P נקודת החיתוך של הצלע CA עם המעגל x^2+y^2=16'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const p = P(d)!;
      expect(Math.hypot(p.x - NEAR.x, p.y - NEAR.y), `seed ${seed}: on the side`).toBeLessThan(2e-3);
    }
  });

  it('«הישר CA» on a DRAWN side denotes the side — one root, ruling (a): the figure is the authority', () => {
    for (let seed = 0; seed < 12; seed++) {
      const d = derive([...T11, 'P נקודת החיתוך של הישר CA עם המעגל x^2+y^2=16'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const p = P(d)!;
      expect(Math.hypot(p.x - NEAR.x, p.y - NEAR.y), `seed ${seed}`).toBeLessThan(2e-3);
    }
  });

  it('a chord that genuinely meets the circle twice keeps BOTH roots across seeds (the case the ruling protects)', () => {
    const lines = ['A(-5,1)', 'B(5,1)', 'משוואת המעגל x^2+y^2=16', 'הקטע AB', 'P נקודת החיתוך של הקטע AB עם המעגל x^2+y^2=16'];
    const signs = new Set<number>();
    for (let seed = 0; seed < 12; seed++) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const p = P(d)!;
      expect(Math.abs(p.y - 1)).toBeLessThan(1e-6);
      signs.add(Math.sign(p.x));
    }
    expect([...signs].sort()).toEqual([-1, 1]);
  });

  it('a segment that never reaches the circle has NO crossing: reported once on the line that stated it, never drawn beyond its end', () => {
    const lines = ['A(0,0)', 'B(1,0)', 'משוואת המעגל x^2+y^2=16', 'הקטע AB', 'P נקודת החיתוך של הקטע AB עם המעגל x^2+y^2=16'];
    for (const seed of [0, 1, 2]) {
      const d = derive(lines, seed);
      expect(d.faults.map((f) => [f.index, f.code]), `seed ${seed}`).toEqual([[4, 'unsatisfiable']]);
      expect(d.outcomes[4]).toBe('faulted');
    }
  });

  it('a stated LINE named by two placed points that the figure does not draw as a piece keeps its infinite reading', () => {
    // no «משולש», no «הקטע» — CA is two points and the sentence's «הישר» is the only word for it
    const lines = ['A(0,0)', 'C(3,5)', 'משוואת המעגל x^2+y^2=16', 'P נקודת החיתוך של הישר CA עם המעגל x^2+y^2=16'];
    const seen = new Set<number>();
    for (let seed = 0; seed < 12; seed++) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      seen.add(Math.sign(P(d)!.y));
    }
    expect([...seen].sort(), 'both roots of the infinite line are configurations').toEqual([-1, 1]);
  });
});

describe('#1286 — one extent ruler', () => {
  it('the ring filter, the bounded residual and the promotion read the same predicate', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 2, y: 0 };
    expect(segmentParam(a, b, { x: 1, y: 5 })).toBeCloseTo(0.5, 12);
    expect(withinSegment(a, b, { x: 2 + 1e-7, y: 0 })).toBe(true);
    expect(withinSegment(a, b, { x: 2.001, y: 0 })).toBe(false);
    expect(segmentParam(a, a, b)).toBeNull();
  });

  it('the figure is the authority: a segment object or a polygon side over the pair makes the incidence bounded', () => {
    const facts: Fact[] = [];
    for (const l of T11) {
      const r = parseLine(l);
      if (!r.ok) throw new Error(l);
      facts.push(...r.facts);
    }
    const { construction } = fold(facts);
    expect(drawnPieceOver(construction, 'C', 'A'), 'CA is a side of משולש ABC').toBe(true);
    expect(drawnPieceOver(construction, 'A', 'C')).toBe(true);
    expect(drawnPieceOver(construction, 'A', 'B')).toBe(true);
    const bare = fold(parseLine('A(0,0)').ok ? [...(parseLine('A(0,0)') as { ok: true; facts: Fact[] }).facts, ...(parseLine('C(3,5)') as { ok: true; facts: Fact[] }).facts] : []).construction;
    expect(drawnPieceOver(bare, 'A', 'C'), 'two placed points draw no piece').toBe(false);
  });
});
