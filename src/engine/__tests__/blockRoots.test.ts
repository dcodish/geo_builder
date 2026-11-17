/**
 * #2744 ([ADR-856](../../../docs/06-decisions.md#adr-856)) — the other roots of a free point its own givens fix.
 *
 * `enumerateFreePointRoots` alone, on constructions built here: a point held to a line by a driven collinear and fixed
 * on it by a second scalar given (a distance, an angle, an area) has two roots, both listed, each in its anchors' frame;
 * a root a bound rules out is deflated past and not listed; a point with freedom left, or one ADR-166's reflection owns,
 * is not listed; the listing is deterministic, capped, and survives a spin of the anchors.
 */
import { describe, expect, it } from 'vitest';
import { applyRootChoice, blockRootStats, enumerateFreePointRoots, evaluate, rootChoice } from '@/engine';
import type { Constraint, Construction, GeoObject, Vec } from '@/engine';
import { fromFrame } from '@/engine/blockRoots';

/** A, B, D pinned (a square's corner: A at the origin, B along x, D along y, side 10); E a free point held to line AB. */
function onLineAB(second: Constraint, extra: Constraint[] = []): Construction {
  const objects: GeoObject[] = [
    { kind: 'free-point', id: 'A', x: 0, y: 0, pinned: true },
    { kind: 'free-point', id: 'B', x: 10, y: 0, pinned: true },
    { kind: 'free-point', id: 'D', x: 0, y: 10, pinned: true },
    { kind: 'free-point', id: 'E', x: 3, y: 1, solve: { constraint: { type: 'collinear', a: 'E', b: 'A', c: 'B' }, branch: 0, also: [second] } },
  ] as GeoObject[];
  return { objects, constraints: [{ type: 'collinear', a: 'E', b: 'A', c: 'B' }, second, ...extra] } as Construction;
}
const xs = (c: Construction) => {
  const list = enumerateFreePointRoots(c);
  const e = list.find((p) => p.id === 'E');
  if (!e) return [];
  const pos = new Map<string, Vec>([['A', { x: 0, y: 0 }], ['B', { x: 10, y: 0 }], ['D', { x: 0, y: 10 }]]);
  return e.roots.map((r) => fromFrame(r, e.frame.map((id) => pos.get(id)!))).map((p) => Math.round(p.x * 1e4) / 1e4);
};

describe('#2744 — enumerateFreePointRoots', () => {
  it('a line and a distance: both roots, the fold\'s own first (DE = 12 ⇒ E at ±√44 from A)', () => {
    const c = onLineAB({ type: 'distance', a: 'D', b: 'E', value: 12 });
    expect(evaluate(c).ok).toBe(true);
    const r = xs(c);
    expect(r.length).toBe(2);
    expect(r[0]).toBeCloseTo(Math.sqrt(44), 3);
    expect(r[1]).toBeCloseTo(-Math.sqrt(44), 3);
  });

  it('a line and an angle: both roots (∠ADE = 30° ⇒ E at ±10·tan 30°)', () => {
    const r = xs(onLineAB({ type: 'angle', vertex: 'D', ray1: 'A', ray2: 'E', value: 30 } as Constraint));
    expect(r.length).toBe(2);
    expect(r.map(Math.abs).every((v) => Math.abs(v - 10 * Math.tan(Math.PI / 6)) < 1e-3)).toBe(true);
    expect(Math.sign(r[0])).toBe(-Math.sign(r[1]));
  });

  it('a line and an area: both roots ((ADE) = 20 ⇒ E at ±4), across the kink where the triangle flattens', () => {
    const r = xs(onLineAB({ type: 'area', ids: ['A', 'D', 'E'], value: 20 } as Constraint));
    expect(r.length).toBe(2);
    expect(r.map((v) => Math.abs(v))).toEqual([4, 4]);
    expect(Math.sign(r[0])).toBe(-Math.sign(r[1]));
  });

  it('a root a stated bound rules out is not listed, so nothing is left to choose (BE < 10 rules out the far root)', () => {
    const c = onLineAB({ type: 'distance', a: 'D', b: 'E', value: 12 }, [{ type: 'length-bound', a: 'B', b: 'E', max: 10, maxStrict: true } as Constraint]);
    expect(evaluate(c).ok).toBe(true);
    expect(enumerateFreePointRoots(c).filter((p) => p.id === 'E')).toEqual([]);
  });

  it('a point with freedom left is not listed (E on line AB, nothing else)', () => {
    const c: Construction = {
      objects: onLineAB({ type: 'distance', a: 'D', b: 'E', value: 12 }).objects.map((o) =>
        o.id === 'E' ? ({ kind: 'free-point', id: 'E', x: 3, y: 1, solve: { constraint: { type: 'collinear', a: 'E', b: 'A', c: 'B' }, branch: 0 } } as GeoObject) : o,
      ),
      constraints: [{ type: 'collinear', a: 'E', b: 'A', c: 'B' }],
    } as Construction;
    expect(enumerateFreePointRoots(c)).toEqual([]);
  });

  it('a point ADR-166\'s reflection owns is not listed (an apex equidistant from two anchors)', () => {
    const c = {
      objects: [
        { kind: 'free-point', id: 'A', x: 0, y: 0, pinned: true },
        { kind: 'free-point', id: 'B', x: 10, y: 0, pinned: true },
        { kind: 'free-point', id: 'P', x: 4, y: 3, solve: { constraint: { type: 'distance', a: 'A', b: 'P', value: 8 }, branch: 0, also: [{ type: 'distance', a: 'B', b: 'P', value: 8 }] } },
      ],
      constraints: [{ type: 'distance', a: 'A', b: 'P', value: 8 }, { type: 'distance', a: 'B', b: 'P', value: 8 }],
    } as unknown as Construction;
    expect(evaluate(c).ok).toBe(true);
    expect(enumerateFreePointRoots(c)).toEqual([]);
  });

  it('deterministic and capped, and the listing runs its counted solves', () => {
    const c = onLineAB({ type: 'distance', a: 'D', b: 'E', value: 12 });
    const before = { ...blockRootStats };
    const a = enumerateFreePointRoots(c);
    const b = enumerateFreePointRoots(c);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.every((p) => p.roots.length <= 3)).toBe(true);
    expect(blockRootStats.listings - before.listings).toBe(2);
    expect(blockRootStats.solves).toBeGreaterThan(before.solves);
  });

  it('the anchors\' frame survives a spin: a chosen root placed in rotated anchors is the rotated root', () => {
    const c = onLineAB({ type: 'distance', a: 'D', b: 'E', value: 12 });
    const [e] = enumerateFreePointRoots(c).filter((p) => p.id === 'E');
    const th = 1.1, s = 0.6;
    const rot = (p: Vec): Vec => ({ x: s * (Math.cos(th) * p.x - Math.sin(th) * p.y) + 3, y: s * (Math.sin(th) * p.x + Math.cos(th) * p.y) - 2 });
    const spun = { ...c, objects: c.objects.map((o) => (o.kind === 'free-point' ? { ...o, ...rot({ x: o.x, y: o.y }) } : o)) } as Construction;
    // a seed whose stream picks the far root
    let seed = 1;
    while (rootChoice(seed, 'E', e.roots.length) !== 1) seed++;
    const steered = applyRootChoice(spun, [e], seed);
    const E = steered.objects.find((o) => o.id === 'E') as { x: number; y: number };
    const want = rot({ x: -Math.sqrt(44), y: 0 });
    expect(E.x).toBeCloseTo(want.x, 4);
    expect(E.y).toBeCloseTo(want.y, 4);
    // seed 0 is never steered
    expect(applyRootChoice(spun, [e], 0)).toBe(spun);
  });
});
