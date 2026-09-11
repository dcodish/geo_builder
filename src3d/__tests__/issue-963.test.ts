/**
 * #963 (ADR-3D-238) — A POINT IS A LEGAL CONTAINED SIDE.
 *
 * #614 gave containment an input form and wired both frames — «ℓ מוכל במישור π» and the
 * container-headed «המישור π מכיל את ℓ» — through the shared operand reader. It wired them for a LINE.
 * A POINT fell out at one guard in `planeRelGiven`:
 *
 *     if (a.op.kind === 'point' || b.op.kind === 'point') return null; // a point has no direction
 *
 * which is right for perp/parallel/angle and wrong for containment: a point in a plane is MEMBERSHIP,
 * the most ordinary statement in a solid-geometry question, and `on-planes` has existed since
 * ADR-3D-015.
 *
 * **The issue's headline diagnosis was wrong, and measuring said so.** #963 was filed as
 * *"membership exists ONLY in English"*. It does not: «C על המישור π1» and «הנקודה C על המישור π1»
 * both build, and always did. What was missing is the CONTAINMENT FRAME for a point — in **both**
 * languages, since "C lies in plane π1" failed exactly as «C מוכלת במישור π1» did while "lies on"
 * worked. That correction changes the fix: not a set of Hebrew spellings bolted onto a rule, but one
 * operand kind admitted to one frame, which is why every spelling below is served by a single edit.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';

const cmds = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`expected «${u}» to parse, got ${r.reason}`);
  return r.commands;
};
const handled = (u: string) => parse3(u).ok;

describe('#963 — point-in-plane membership, every frame and both languages', () => {
  // The issue's own eight rows, verbatim. Seven were not-handled; the first was the only one that built.
  it.each([
    ['English on (worked before)', 'C on plane π1'],
    ['contained, feminine', 'C מוכלת במישור π1'],
    ['contained, masculine', 'C מוכל במישור π1'],
    ['contained, with the noun', 'הנקודה C מוכלת במישור π1'],
    ['located in, feminine', 'C נמצאת במישור π1'],
    ['located in, masculine', 'C נמצא במישור π1'],
    ['container-headed', 'המישור π1 מכיל את C'],
    ['container-headed, with the noun', 'המישור π1 מכיל את הנקודה C'],
  ])('%s', (_label, u) => {
    expect(cmds(u)).toEqual([{ type: 'on-planes', id: 'C', plane: 'π1' }]);
  });

  // The correction to the issue's diagnosis, asserted so it cannot quietly revert to "a Hebrew problem":
  // the ENGLISH containment verb was equally broken, and the Hebrew "on" spelling was equally fine.
  it.each([
    ['English lies in — was broken too', 'C lies in plane π1'],
    ['English, with the noun', 'point C lies in plane π1'],
    ['English lies on — worked before', 'C lies on plane π1'],
    ['Hebrew on — worked before', 'C על המישור π1'],
    ['Hebrew on, with the noun', 'הנקודה C על המישור π1'],
    ['Hebrew rests-on verb', 'C מונחת במישור π1'],
  ])('%s', (_label, u) => {
    expect(cmds(u)).toEqual([{ type: 'on-planes', id: 'C', plane: 'π1' }]);
  });

  it('a point-RUN container is materialised first, exactly as the «על» spelling does', () => {
    // Both spellings of one statement must reach the same pair of commands, or the panel row and the
    // typed sentence disagree again — which is the asymmetry #614 exists to prevent.
    const viaContained = cmds('C מוכלת במישור ABD');
    expect(viaContained).toEqual([
      { type: 'plane-through', name: 'ABD', ids: ['A', 'B', 'D'] },
      { type: 'on-planes', id: 'C', plane: 'ABD' },
    ]);
    expect(cmds('המישור ABD מכיל את C')).toEqual(viaContained);
  });
});

describe('#963 — what a point-side containment must still refuse', () => {
  it('a SEGMENT is not a container', () => {
    // A segment does contain points, but this relation's container is a plane. Refusing keeps the
    // boundary the line lane already draws, instead of inventing an on-segment meaning here.
    for (const u of ['C מוכלת בקטע AB', 'C מוכלת ב-AB', 'C is contained in AB']) {
      expect(handled(u), u).toBe(false);
    }
  });

  it('the COORDINATE frame and the axes keep their own cells (#614 / #512)', () => {
    // Containment against the frame is `coordPlaneRel`'s business and returns null earlier; falling
    // into this lane would record a second spelling of a relation that already has one owner.
    expect(handled('C מוכלת במישור [xy]')).toBe(false);
    expect(handled('C מוכלת בציר x')).toBe(false);
  });

  it('a point still has no DIRECTION — perp and parallel stay refused', () => {
    // The guard this fix carves an exception out of must keep governing every relation that really is
    // about direction. Exempting containment must not exempt the rest.
    expect(handled('C מאונך למישור π1')).toBe(false);
    expect(handled('C מקביל למישור π1')).toBe(false);
  });

  it('a point contained in itself states nothing', () => {
    expect(handled('C מוכלת ב-C')).toBe(false);
  });

  it('the LINE lane is untouched — it still lowers to line-rel, not on-planes', () => {
    expect(cmds('הישר l1 מוכל במישור π1')).toEqual([
      { type: 'line-rel', rel: 'contained', op: { kind: 'plane-named', name: 'π1' }, line: 'ℓ1' },
    ]);
    expect(cmds('המישור π1 מכיל את הישר l1')).toEqual([
      { type: 'line-rel', rel: 'contained', op: { kind: 'plane-named', name: 'π1' }, line: 'ℓ1' },
    ]);
  });
});
