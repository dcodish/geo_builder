/**
 * ADR-080 — declaring an EXISTING free vertex "on circle O" makes it a real point ON the circle.
 *
 * A free shape vertex (e.g. a quadrilateral corner) re-declared on a circle whose size is not pinned by a
 * through-point converts to an on-circle point (it slides on the circle), so "C,D on circle O" makes CD a
 * genuine chord — instead of the old behaviour where the relation was structurally dropped and the vertex
 * stayed adrift (the givens verifier's "C is not on circle O"). A PINNED point (explicitly placed by the
 * student) is a given, not a DOF, so it is NOT slid — the guard preserves it.
 */

import { describe, it, expect } from 'vitest';
import { build } from '../step';
import { evaluate } from '../evaluate';
import { dist } from '../geometry';
import type { Command } from '../types';

const onCircle = (id: string): Command => ({ type: 'point-on-circle', id, circle: 'circle-O' });

describe('an existing free vertex declared on a circle lands ON it (ADR-080)', () => {
  it('quad BKCD + "C,D on circle O" → C and D become a real chord (equidistant from the centre)', () => {
    const { construction } = build([
      { type: 'quadrilateral', ids: ['B', 'K', 'C', 'D'] },
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true },
      onCircle('C'),
      onCircle('D'),
    ]);
    // both C and D are now on-circle points, not free vertices
    for (const id of ['C', 'D']) expect(construction.objects.find((o) => o.id === id)?.kind).toBe('on-circle');
    const e = evaluate(construction);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const [O, C, D] = ['O', 'C', 'D'].map((id) => e.positions.get(id)!);
    expect(dist(O, C)).toBeCloseTo(dist(O, D), 6); // both on the circle (equal radius)
  });

  it('a PINNED point (explicitly placed) is NOT converted — it stays put, the verifier reports instead', () => {
    const { construction } = build([
      { type: 'free-point', id: 'P', x: 1, y: 1 }, // pinned: an explicit placement
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true },
      onCircle('P'),
    ]);
    expect(construction.objects.find((o) => o.id === 'P')?.kind).toBe('free-point'); // not slid onto the circle
    const e = evaluate(construction);
    if (e.ok) expect(e.positions.get('P')).toEqual({ x: 1, y: 1 }); // exactly where the student put it
  });
});
