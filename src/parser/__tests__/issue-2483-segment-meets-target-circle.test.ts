/**
 * #2483 / round #2501 ([ADR-758](../../../docs/06-decisions.md#adr-758) Am. 1) — «XY חותך את המעגל בנקודה C» asks
 * which end of XY is ON THE TARGET CIRCLE (the end the crossing avoids, and whether a centre-ended segment is a
 * radius). That is `membersOfCenter(target)`, never "on SOME circle".
 *
 * Measured on fix/2483 at df71dc24: the reader asked `circleContaining(ctx, [end], target)`, which only PREFERS the
 * target and falls back to ANY circle. ADR-758 made a radius's through-point a member, so the tangent construction's
 * centre O became a member of its hidden Thales circle, and the 2022-summer-a fixture's «AO חותך את המעגל בנקודה C»
 * re-lowered `avoid: "O"` (the centre) instead of `avoid: "A"`. The same fallback mis-read a centre-ended segment
 * whose far end rides ANOTHER circle as a radius (the infinite line, so the within-segment selection was lost).
 */
import { describe, expect, it } from 'vitest';
import { replay, useGeoStore } from '@/store/geoStore';
import { parse, buildParseCtx } from '@/parser';
import type { AnyCommand } from '@/engine';
import { driveThroughGate } from '../../__tests__/submit-gate';

function crossingOf(prefix: string[], line: string): Extract<AnyCommand, { type: 'line-circle-intersection' }> {
  const { refused } = driveThroughGate(prefix);
  expect(refused, `the prefix builds: ${prefix.join(' · ')}`).toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const p = parse(line, buildParseCtx(d.construction, d.positions));
  expect(p.ok, line).toBe(true);
  const cmd = (p.ok ? p.commands : []).find((c) => c.type === 'line-circle-intersection');
  expect(cmd, `${line} lowers to a line∩circle`).toBeDefined();
  return cmd as Extract<AnyCommand, { type: 'line-circle-intersection' }>;
}

describe('a segment meeting a circle reads membership on THAT circle only (#2483, round #2501)', () => {
  it('the tangent figure: the centre rides the hidden Thales circle, but the crossing avoids A, not the centre', () => {
    const cmd = crossingOf(['נתון מעגל שרדיוסו R ומרכזו O', 'מנקודה A הוציאו משיק למעגל בנקודה B', 'המשך AO חותך את המעגל בנקודה D'], 'AO חותך את המעגל בנקודה C');
    expect(cmd.avoid).toBe('A');
    expect(cmd.onSegment).toEqual(['A', 'O']);
  });

  it('a centre-ended segment whose far end is on ANOTHER circle is not a radius: the crossing stays within it', () => {
    const cmd = crossingOf(['מעגל שמרכזו O', 'מעגל שמרכזו P', 'נקודה A על מעגל P'], 'AO חותך את המעגל O בנקודה C');
    expect(cmd.onSegment).toEqual(['A', 'O']);
  });

  it('the end on the target circle is the avoided one, though the other end rides another circle', () => {
    const cmd = crossingOf(['מעגל שמרכזו O', 'מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה B על מעגל O'], 'AB חותך את המעגל O בנקודה C');
    expect(cmd.avoid).toBe('B');
  });
});
