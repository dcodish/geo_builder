/**
 * Segment-crossing detection for the snap-to-intersection affordance.
 * Pure (x,y): a crossing is offered only when two declared segments cross
 * strictly inside both, isn't already a named point, and adjacent segments
 * (sharing a vertex) are never offered.
 */

import { describe, it, expect } from 'vitest';
import type { Command } from '@/engine/types';
import { build } from '@/engine';
import { findSegmentCrossings } from '../intersections';

describe('findSegmentCrossings', () => {
  it('offers the diagonal crossing of a parallelogram + the BD diagonal (the reported figure)', () => {
    // parallelogram ABCD has sides AB,BC,CD,DA and diagonal AC (a side of the
    // earlier triangle). Adding segment BD makes AC × BD cross at the centre.
    const cmds: Command[] = [
      { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] },
      { type: 'segment', a: 'A', b: 'C' }, // diagonal AC
      { type: 'segment', a: 'B', b: 'D' }, // diagonal BD
    ];
    const { construction, positions } = build(cmds);
    const crossings = findSegmentCrossings(construction, positions);

    expect(crossings).toHaveLength(1);
    const x = crossings[0];
    // the two crossing segments are AC and BD
    expect([x.a, x.b].sort()).toEqual(['A', 'C']);
    expect([x.c, x.d].sort()).toEqual(['B', 'D']);
    // a parallelogram's diagonals bisect each other → crossing at the midpoint of AC
    const A = positions.get('A')!;
    const C = positions.get('C')!;
    expect(x.pos.x).toBeCloseTo((A.x + C.x) / 2, 9);
    expect(x.pos.y).toBeCloseTo((A.y + C.y) / 2, 9);
  });

  it('does not offer a crossing at a shared vertex (adjacent segments)', () => {
    // A triangle's three sides only meet at vertices — no interior crossings.
    const { construction, positions } = build([{ type: 'triangle', ids: ['A', 'B', 'C'] }]);
    expect(findSegmentCrossings(construction, positions)).toHaveLength(0);
  });

  it('stops offering a crossing once it has been named', () => {
    const cmds: Command[] = [
      { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] },
      { type: 'segment', a: 'A', b: 'C' },
      { type: 'segment', a: 'B', b: 'D' },
    ];
    const before = build(cmds);
    expect(findSegmentCrossings(before.construction, before.positions)).toHaveLength(1);

    // Name the crossing → the dot must disappear (an existing point sits there now).
    const after = build([...cmds, { type: 'line-line-intersection', id: 'M', a: 'A', b: 'C', c: 'B', d: 'D' }]);
    expect(findSegmentCrossings(after.construction, after.positions)).toHaveLength(0);
  });

  it('offers nothing when segments are parallel (no crossing)', () => {
    // The two parallel sides of a parallelogram never cross.
    const { construction, positions } = build([{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }]);
    expect(findSegmentCrossings(construction, positions)).toHaveLength(0);
  });
});
