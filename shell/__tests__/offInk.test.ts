/**
 * #1937 + #1971 (ADR-W-124) — the shared geometry of the off-ink dashed extension. Pure: points in, stretches out.
 */
import { describe, expect, it } from 'vitest';
import { offInkExtensions } from '../offInk';

const P = (x: number, y: number) => ({ x, y });

describe('offInkExtensions — when a carrying line is extended, dashed, to its point', () => {
  const D = P(1, 3);
  const C = P(5, 3);

  it('a point beyond the span gets the stretch from the nearer end to it (the #1971 foot)', () => {
    expect(offInkExtensions([{ p: P(0, 3), a: D, b: C }], [{ a: D, b: C }])).toEqual([{ from: D, to: P(0, 3) }]);
    expect(offInkExtensions([{ p: P(7, 3), a: D, b: C }], [{ a: D, b: C }])).toEqual([{ from: C, to: P(7, 3) }]);
  });

  it('a point inside the span gets nothing — a foot ON its side, the convex diagonal meet', () => {
    expect(offInkExtensions([{ p: P(3, 3), a: D, b: C }], [{ a: D, b: C }])).toEqual([]);
    expect(offInkExtensions([{ p: D, a: D, b: C }], [{ a: D, b: C }]), 'at an end, closed').toEqual([]);
  });

  it('a point not ON its carrier at this configuration gets nothing — never an incidence the figure lacks', () => {
    expect(offInkExtensions([{ p: P(0, 3.5), a: D, b: C }], [{ a: D, b: C }])).toEqual([]);
  });

  it('ink already drawn along the line is subtracted — a point the ink reaches gets nothing', () => {
    expect(offInkExtensions([{ p: P(0, 3), a: D, b: C }], [{ a: D, b: C }, { a: P(-1, 3), b: P(1, 3) }])).toEqual([]);
  });

  it('PARTIAL ink leaves only the uncovered stretch', () => {
    const got = offInkExtensions([{ p: P(9, 3), a: D, b: C }], [{ a: D, b: C }, { a: C, b: P(7, 3) }]);
    expect(got).toEqual([{ from: P(7, 3), to: P(9, 3) }]);
  });

  it('an infinite drawn line along the carrier covers everything; a crossing line covers nothing', () => {
    expect(offInkExtensions([{ p: P(0, 3), a: D, b: C }], [], [{ anchor: P(100, 3), dir: P(-2, 0) }])).toEqual([]);
    expect(offInkExtensions([{ p: P(0, 3), a: D, b: C }], [], [{ anchor: P(0, 0), dir: P(0, 1) }])).toEqual([{ from: D, to: P(0, 3) }]);
  });

  it('the span need not be inked — the stretch still runs from its nearer end (a meet named by the noun, #1751)', () => {
    expect(offInkExtensions([{ p: P(2, 2), a: P(0, 0), b: P(1, 1) }], [])).toEqual([{ from: P(1, 1), to: P(2, 2) }]);
  });

  it('two carriers of one stretch are drawn once', () => {
    const k = { p: P(0, 3), a: D, b: C };
    expect(offInkExtensions([k, { ...k, a: C, b: D }], [])).toHaveLength(1);
  });

  it('the operator’s #1937 figure: AC extended from C to O(2,2); BD already passes through O', () => {
    const [A, B, Cc, Dd, O] = [P(0, 0), P(4, 0), P(1, 1), P(0, 4), P(2, 2)];
    const got = offInkExtensions(
      [
        { p: O, a: A, b: Cc },
        { p: O, a: B, b: Dd },
      ],
      [
        { a: A, b: Cc },
        { a: B, b: Dd },
      ],
    );
    expect(got).toEqual([{ from: Cc, to: O }]);
  });

  it('is scale-free: a figure 1000× larger is judged the same way', () => {
    const k = (s: number) => ({ p: P(0, 3 * s), a: P(1 * s, 3 * s), b: P(5 * s, 3 * s) });
    expect(offInkExtensions([k(1000)], [])).toHaveLength(1);
    expect(offInkExtensions([k(0.001)], [])).toHaveLength(1);
  });
});
