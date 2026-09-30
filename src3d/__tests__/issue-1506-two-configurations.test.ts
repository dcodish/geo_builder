/**
 * #1506 (ADR-3D-289) — "there are 2 possible configs to this shape now so shouldnt we be showing both
 * in the data panel?" (operator, 2026-09-28, playing the #1499 sheet, T7 — «SM⊥ABC» then «|SM| = 4»).
 *
 * Before: the data panel printed «S(?, 7/2, ?)» — the #827 (ADR-3D-194) singleton rule, correct as far
 * as it went: x and z are a branch choice. The pivot's admissible pool already held exactly the two
 * positions (S above / below plane ABC).
 *
 * Operator ruling (2026-09-29): *"2 options - yes … but not more than 2."* EXACTLY two configurations,
 * the same two at every sample, print one row each — «S₁(1.33, 7/2, 3.33)» / «S₂(−4.33, 7/2, −2.33)»,
 * components paired BY ROOT (S(1.33, ·, −2.33) is not an admissible point). Three or more, or a pair
 * that moves with the seed, keep «?» exactly as before.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dataView, twoConfigurations3 } from '../engine/dataView';
import type { Vec3 } from '../engine/vec3';

const st = () => useGeo3.getState();
beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});

const build = (lines: readonly string[]) => {
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, `«${l}» should build`).toBeNull();
  }
};
const panelAt = (seed: number) => {
  const d = derive3(st().facts, seed);
  return { panel: dataView(d.construction, seed), drawn: d.positions };
};
const rowsOf = (rows: readonly string[], id: string) => rows.filter((r) => r.startsWith(id) && /^[^(]*\(/.test(r) && r.slice(0, r.indexOf('(')).replace(/[₀-₉]/g, '') === id);

/** #1499's play-sheet T7: the operator's exact #1499 sequence, then «|SM| = 4». */
const T7 = [
  'ABC משולש',
  'AB=u',
  'AC=v',
  'A(0,2,-1)',
  'B(-3,2,2)',
  'D על BC',
  'D(-2,3,1)',
  'AD=(2/3)u+(1/3)v',
  'ABEC מלבן',
  'M מפגש אלכסונים במלבן ABEC',
  'SM⊥ABC',
  '|SM| = 4',
] as const;

describe('#1506 — exactly two configurations print both, one row each', () => {
  it('T7 prints S₁ / S₂ with each row a WHOLE configuration, at every seed', () => {
    build(T7);
    for (const seed of [0, 1, 17]) {
      const { panel } = panelAt(seed);
      expect(rowsOf(panel.points, 'S'), `seed ${seed}`).toEqual(['S₁(1.33, 7/2, 3.33)', 'S₂(-4.33, 7/2, -2.33)']);
      // the determined points are untouched
      expect(panel.points, `seed ${seed}`).toContain('M(-3/2, 7/2, 1/2)');
    }
  });

  it('each printed configuration IS admissible: |SM| = 4 and SM ⊥ ABC (the pairing is by root, never mixed)', () => {
    build(T7);
    const d = derive3(st().facts, 0);
    const roots = d.resolved.pivot?.pointRoots?.S;
    expect(roots, 'the pool must carry S').toBeDefined();
    const two = twoConfigurations3([{ roots, drawn: d.positions.get('S')! }])!;
    expect(two).not.toBeNull();
    const M = d.positions.get('M')!;
    const n = { x: 1 / Math.SQRT2, y: 0, z: 1 / Math.SQRT2 }; // ABC's normal ∝ (1, 0, 1)
    for (const s of two) {
      const v = { x: s.x - M.x, y: s.y - M.y, z: s.z - M.z };
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(4, 4);
      expect(Math.hypot(v.y, v.x * n.z - v.z * n.x)).toBeLessThan(1e-4); // v ∥ n
    }
  });

  it('the order is canonical — it does not follow which configuration is drawn', () => {
    build(T7);
    const seen = new Map<string, string>(); // drawn side → rows
    for (const seed of [0, 1, 2]) {
      const { panel, drawn } = panelAt(seed);
      seen.set(drawn.get('S')!.x > 0 ? 'above' : 'below', JSON.stringify(rowsOf(panel.points, 'S')));
    }
    expect([...seen.keys()].sort(), 'both configurations must be drawn somewhere in the sweep').toEqual(['above', 'below']);
    expect(new Set(seen.values()).size).toBe(1);
  });

  it('the canvas label keeps the #827 partial form — the node shows ONE configuration', () => {
    build(T7);
    expect(panelAt(0).panel.pointCoords.S).toEqual({ text: '(?, 7/2, ?)', kind: 'partial' });
  });
});

describe('#1506 — anything but exactly two stable configurations keeps «?»', () => {
  it('MORE than two (a box with «C(p+q,1,0)» — a continuum the pool samples many times) keeps C(?, 1, 0)', () => {
    build(["תיבה ABCDA'B'C'D'", 'C(p+q,1,0)']);
    const rows = rowsOf(panelAt(0).panel.points, 'C');
    expect(rows).toEqual(['C(?, 1, 0)']);
  });

  it('a pair that MOVES with the seed (C on a circle: |AC| = 5, |BC| = 3) keeps C(4, ?, ?)', () => {
    build(['ABC משולש', 'A(0,0,0)', 'B(4,0,0)', '|AC| = 5', '|BC| = 3']);
    for (const seed of [0, 1, 2]) {
      expect(rowsOf(panelAt(seed).panel.points, 'C'), `seed ${seed}`).toEqual(['C(4, ?, ?)']);
    }
  });

  it('before the height is stated («SM⊥ABC» alone), S keeps S(?, 7/2, ?)', () => {
    build(['ABC משולש', 'A(0,2,-1)', 'B(-3,2,2)', 'C(0,5,-1)', 'M אמצע BC', 'SM⊥ABC']);
    expect(rowsOf(panelAt(0).panel.points, 'S')).toEqual(['S(?, 7/2, ?)']);
  });
});

describe('#1506 — the decision itself (twoConfigurations3)', () => {
  const P = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
  const a = P(1.328, 3.5, 3.328);
  const b = P(-4.328, 3.5, -2.328);

  it('deduplicates repeated pool entries (the pool stores one entry per solution)', () => {
    expect(twoConfigurations3([{ roots: [b, a, a, P(1.3280001, 3.5, 3.328)], drawn: a }])).toEqual([a, b]);
  });

  it('canonical order: larger on the first axis where they differ', () => {
    expect(twoConfigurations3([{ roots: [a, b], drawn: b }])).toEqual([a, b]);
    expect(twoConfigurations3([{ roots: [b, a], drawn: a }])).toEqual([a, b]);
    const c = P(2, 1, 0);
    const d = P(2, -1, 0);
    expect(twoConfigurations3([{ roots: [d, c], drawn: d }])).toEqual([c, d]);
  });

  it('three distinct configurations → null (the operator: "not more than 2")', () => {
    expect(twoConfigurations3([{ roots: [a, b, P(0, 3.5, 0)], drawn: a }])).toBeNull();
  });

  it('a sample with a single solution (no pool) → null', () => {
    expect(twoConfigurations3([{ roots: [a, b], drawn: a }, { roots: undefined, drawn: a }])).toBeNull();
  });

  it('a pair that differs between samples → null', () => {
    expect(twoConfigurations3([{ roots: [a, b], drawn: a }, { roots: [a, P(-4, 3.5, -2)], drawn: a }])).toBeNull();
  });

  it('a drawn position outside the pair → null (the pool must describe the figure on screen)', () => {
    expect(twoConfigurations3([{ roots: [a, b], drawn: P(0, 0, 0) }])).toBeNull();
  });

  it('no samples → null', () => {
    expect(twoConfigurations3([])).toBeNull();
  });
});
