/**
 * Segment-crossing detection for the snap-to-intersection affordance.
 * Pure (x,y): a crossing is offered only when two declared segments cross
 * strictly inside both, isn't already a named point, and adjacent segments
 * (sharing a vertex) are never offered.
 */

import { describe, it, expect } from 'vitest';
import type { Command, Vec } from '@/engine/types';
import { applySeed, build, evaluate } from '@/engine';
import { parse } from '@/parser';
import { factsOf } from '@/__tests__/scenarios-corpus';
import { firstSatisfyingSeed, meetsRequirements, replay } from '@/store/geoStore';
import { crossingCommands, findInkCrossings } from '../inkCrossings';

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
    const crossings = findInkCrossings(construction, positions);

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
    expect(findInkCrossings(construction, positions)).toHaveLength(0);
  });

  it('stops offering a crossing once it has been named', () => {
    const cmds: Command[] = [
      { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] },
      { type: 'segment', a: 'A', b: 'C' },
      { type: 'segment', a: 'B', b: 'D' },
    ];
    const before = build(cmds);
    expect(findInkCrossings(before.construction, before.positions)).toHaveLength(1);

    // Name the crossing → the dot must disappear (an existing point sits there now).
    const after = build([...cmds, { type: 'line-line-intersection', id: 'M', a: 'A', b: 'C', c: 'B', d: 'D' }]);
    expect(findInkCrossings(after.construction, after.positions)).toHaveLength(0);
  });

  it('offers nothing when segments are parallel (no crossing)', () => {
    // The two parallel sides of a parallelogram never cross.
    const { construction, positions } = build([{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }]);
    expect(findInkCrossings(construction, positions)).toHaveLength(0);
  });
});

/**
 * The dot gesture is a STATEMENT about the drawn ink, not a coordinate (#234, ADR-379). A dot is only ever
 * offered at a crossing INTERIOR to its operands, so the commands it lowers to must carry that within
 * meaning — otherwise "show another configuration" is free to move the named point off the drawn segments
 * (prod session `ne810woo`: the letter stayed taken while its point left the figure).
 */
describe('crossingCommands — the dot lowers to the within-the-ink meaning (#234)', () => {
  it('segment × segment carries the joint ADR-166 onSeg requirement', () => {
    const cmds = crossingCommands({ pos: { x: 0, y: 0 }, a: 'A', b: 'N', c: 'D', d: 'M' }, 'O');
    expect(cmds).toEqual([
      { type: 'line-line-intersection', id: 'O', a: 'A', b: 'N', c: 'D', d: 'M', onSeg: true },
    ]);
  });

  it('is byte-identical to what the TYPED meet form lowers to (one meaning, two input routes)', () => {
    // «AN ו-DM נפגשים בנקודה O» — the typed gesture-equivalent. Both must produce the same command.
    const typed = parse('AN ו-DM נפגשים בנקודה O');
    expect(typed.ok).toBe(true);
    const meet = typed.ok && typed.commands.find((c) => c.type === 'line-line-intersection');
    const clicked = crossingCommands({ pos: { x: 0, y: 0 }, a: 'A', b: 'N', c: 'D', d: 'M' }, 'O')[0];
    expect(meet).toEqual(clicked);
  });

  it('drawn LINE × segment bounds only the SEGMENT operand (an infinite line bounds nothing)', () => {
    const cmds = crossingCommands({ pos: { x: 0, y: 0 }, line1: 'line-tangent-1', c: 'C', d: 'D' }, 'O');
    expect(cmds).toEqual([
      { type: 'line-through', id: 'line-CD', a: 'C', b: 'D' },
      { type: 'line-intersection', id: 'O', line1: 'line-tangent-1', line2: 'line-CD' },
      { type: 'set-line', points: ['C', 'O', 'D'] },
    ]);
  });

  it('the named crossing then stays INSIDE both segments in every displayable configuration', () => {
    // The operator's figure shape: M,N on BC with apexes A,D and the four cevians. Under the OLD bare
    // lowering 7 of the 15 displayable seeds put O outside both cevians; under the stated one, none do.
    const steps = ['קטע BC', 'M ו N על BC', 'נקודה A', 'נקודה D', 'AM', 'AN', 'DM', 'DN'];
    const facts = factsOf([...steps, { llm: crossingCommands({ pos: { x: 0, y: 0 }, a: 'A', b: 'N', c: 'D', d: 'M' }, 'O') }]);
    const fig = replay(facts, firstSatisfyingSeed(facts));

    const param = (p: Vec, a: Vec, b: Vec) =>
      ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);

    let displayable = 0;
    for (let s = 0; s < 16; s++) {
      if (!meetsRequirements(facts, s)) continue; // the app never shows this config
      const r = evaluate(applySeed(fig.construction, s));
      if (!r.ok) continue;
      displayable++;
      const p = r.positions;
      const t1 = param(p.get('O')!, p.get('A')!, p.get('N')!);
      const t2 = param(p.get('O')!, p.get('D')!, p.get('M')!);
      expect(t1, `seed ${s}: O within AN`).toBeGreaterThan(0);
      expect(t1, `seed ${s}: O within AN`).toBeLessThan(1);
      expect(t2, `seed ${s}: O within DM`).toBeGreaterThan(0);
      expect(t2, `seed ${s}: O within DM`).toBeLessThan(1);
    }
    expect(displayable, 'the figure still has configurations to show').toBeGreaterThan(0);
  });
});
