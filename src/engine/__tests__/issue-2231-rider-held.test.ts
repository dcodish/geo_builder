/**
 * #2231 ([ADR-795](../../../docs/06-decisions.md#adr-795)) — «MK ⟂ AB» with M a free rider and K a free point nothing else is
 * about. Measured at prod/2026-11-05-2: refused «cannot place M on segment AC so that MK ⟂ AB», though K alone can carry the
 * relation. The student's path is the scenarios `perp-relation-rider-2231`.
 */
import { describe, expect, it } from 'vitest';
import { applyStep } from '../step';
import { heldRiderOfPerpendicular } from '../apply';
import type { Command, Construction, Vec } from '../types';

/** A triangle whose side AC has no point at the K below's perpendicular: M's slide alone has no root. */
function figure(extra: Construction['objects'] = [], constraints: Construction['constraints'] = []): Construction {
  return {
    objects: [
      { kind: 'free-point', id: 'A', x: 2, y: 3.6 },
      { kind: 'free-point', id: 'B', x: 6, y: 0 },
      { kind: 'free-point', id: 'C', x: 0, y: 0 },
      { kind: 'segment', id: 'seg-AB', a: 'A', b: 'B' },
      { kind: 'segment', id: 'seg-AC', a: 'A', b: 'C' },
      { kind: 'on-segment', id: 'M', a: 'A', b: 'C', t: 0.5, free: true },
      { kind: 'free-point', id: 'K', x: 30, y: 20 },
      { kind: 'segment', id: 'seg-KM', a: 'K', b: 'M' },
      ...extra,
    ],
    constraints,
  };
}
const CMD: Command = { type: 'set-perpendicular', a: 'M', b: 'K', c: 'A', d: 'B' };
const dot = (p: Map<string, Vec>) => {
  const [m, k, a, b] = ['M', 'K', 'A', 'B'].map((id) => p.get(id)!);
  return (k.x - m.x) * (b.x - a.x) + (k.y - m.y) * (b.y - a.y);
};

describe('#2231 — the ⟂ falls to its free end when the rider has no position', () => {
  it('builds, the relation holds, K carried it and M keeps its place and its slide', () => {
    const r = applyStep(figure(), CMD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ladder).toContain('main:rider-held');
    expect(Math.abs(dot(r.positions))).toBeLessThan(1e-4);
    expect(r.positions.get('M')).toMatchObject({ x: 1, y: 1.8 });
    expect(r.construction.objects.find((o) => o.id === 'M')).toMatchObject({ kind: 'on-segment', free: true });
  });

  it('asks nothing of a figure where the rider can hold it: the slide still answers', () => {
    const near = figure();
    near.objects = near.objects.map((o) => (o.id === 'K' ? { ...o, x: 2.5, y: 3 } : o));
    const r = applyStep(near, CMD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ladder).not.toContain('main:rider-held');
  });
});

describe('#2231 — heldRiderOfPerpendicular, what it claims', () => {
  it('the rider, held', () => {
    const h = heldRiderOfPerpendicular(figure(), CMD);
    expect(h?.rider).toBe('M');
    expect(h?.held.objects.find((o) => o.id === 'M')).toMatchObject({ free: false });
  });

  it('either side of the relation', () => {
    expect(heldRiderOfPerpendicular(figure(), { type: 'set-perpendicular', a: 'A', b: 'B', c: 'K', d: 'M' })?.rider).toBe('M');
  });

  it('never a vertex: an end something else is about is not a free end', () => {
    expect(heldRiderOfPerpendicular(figure(), { type: 'set-perpendicular', a: 'M', b: 'B', c: 'A', d: 'C' })).toBeNull();
    const used = figure([{ kind: 'segment', id: 'seg-KB', a: 'K', b: 'B' }]);
    expect(heldRiderOfPerpendicular(used, CMD)).toBeNull();
  });

  it('never a rider with a stated place, and only the ⟂', () => {
    const stated = figure();
    stated.objects = stated.objects.map((o) => (o.id === 'M' ? { ...o, free: false } : o));
    expect(heldRiderOfPerpendicular(stated, CMD)).toBeNull();
    expect(heldRiderOfPerpendicular(figure(), { type: 'set-parallel', a: 'M', b: 'K', c: 'A', d: 'B' })).toBeNull();
  });
});
