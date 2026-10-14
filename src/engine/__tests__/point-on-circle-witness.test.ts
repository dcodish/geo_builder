/**
 * #2084 ([ADR-647](../../../docs/06-decisions.md#adr-647)) — apply's `point-on-circle` on an EXISTING point:
 *  (a2) a point already on one circle of a stated tangency, stated on the other, takes the touch point's definition;
 *  (d)  the witness of the residual membership is ANY point the construction puts on the circle — a `radial-toward`
 *       (a tangency's hidden witness) and a stated tangency's touch point included — so the membership is lowered,
 *       never dropped at the bare `break` (which the dry run read as «כבר קיים»).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../apply';
import type { Command, Construction, GeoObject } from '../types';

const empty: Construction = { objects: [], constraints: [] };
const build = (cmds: Command[]) => cmds.reduce((c, cmd) => applyCommand(c, cmd), empty);
const obj = (c: Construction, id: string) => c.objects.find((o) => o.id === id) as GeoObject;

const freePair: Command[] = [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true },
  { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, apart: true },
  { type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'M', external: true },
] as Command[];

describe('#2084 (a2) — a point on both tangent circles is the touch point', () => {
  it('X on O, then on P: X takes M’s own definition (free radii — the radial-toward touch)', () => {
    const c = build([...freePair, { type: 'point-on-circle', id: 'X', circle: 'circle-O' }, { type: 'point-on-circle', id: 'X', circle: 'circle-P' }] as Command[]);
    const { id: _m, ...m } = obj(c, 'M') as GeoObject & { id: string };
    const { id: _x, ...x } = obj(c, 'X') as GeoObject & { id: string };
    expect(x).toEqual(m);
  });

  it('stated radii — the on-segment touch — and the other order', () => {
    const c = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 3 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 2, apart: true },
      { type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'M', external: true },
      { type: 'point-on-circle', id: 'X', circle: 'circle-P' },
      { type: 'point-on-circle', id: 'X', circle: 'circle-O' },
    ] as Command[]);
    expect(obj(c, 'X').kind).toBe(obj(c, 'M').kind);
    expect({ ...obj(c, 'X'), id: 'M' }).toEqual(obj(c, 'M'));
  });

  it('no tangency → not the touch point (the ordinary lowering)', () => {
    const c = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, apart: true },
      { type: 'point-on-circle', id: 'X', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'X', circle: 'circle-P' },
    ] as Command[]);
    expect(obj(c, 'X').kind).not.toBe('radial-toward');
  });
});

describe('#2084 (d) — the witness reads every point on the circle', () => {
  const derived: Command[] = [
    { type: 'free-point', id: 'A', x: 1, y: 7 },
    { type: 'free-point', id: 'B', x: 3, y: 7 },
    { type: 'midpoint', id: 'C', a: 'A', b: 'B' },
  ] as Command[];

  it('a busy free radius whose only point is the tangency’s hidden radial-toward witness', () => {
    const before = build([...freePair, ...derived]);
    const c = applyCommand(before, { type: 'point-on-circle', id: 'C', circle: 'circle-P' } as Command);
    const added = c.constraints.slice(before.constraints.length);
    const drove = c.objects.some((o) => (o as { solve?: { constraint: { type: string } } }).solve?.constraint.type === 'length-radius');
    expect(added.some((k) => k.type === 'length-radius') || drove, 'the membership is lowered, not dropped').toBe(true);
  });

  it('the inner circle of an equal-radii internal tangency (no member at all): the stated touch point', () => {
    const before = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 3 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3, apart: true },
      { type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'M', external: false },
      ...derived,
    ] as Command[]);
    expect((obj(before, 'circle-P') as Extract<GeoObject, { kind: 'circle' }>).radius.via).toBe('tangent-inner');
    const c = applyCommand(before, { type: 'point-on-circle', id: 'C', circle: 'circle-P' } as Command);
    const all = [...c.constraints, ...c.objects.flatMap((o) => ((o as { solve?: { constraint: unknown } }).solve ? [(o as { solve: { constraint: { type: string; witness?: string } } }).solve.constraint] : []))];
    expect(all.some((k) => (k as { type: string; witness?: string }).type === 'length-radius' && (k as { witness?: string }).witness === 'M')).toBe(true);
  });
});
