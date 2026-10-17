/**
 * #2239 ([ADR-692](../../../docs/06-decisions.md#adr-692)) — the givens verifier checks every STATED radius against the
 * drawn one. A stated radius is a size stored on the circle, not a constraint, so before ADR-692 no residual compared
 * it and a route that rewrote it drew green. The backstop: any figure that does not hold a stated radius is not green.
 */
import { describe, expect, it } from 'vitest';
import { checkGivens } from '../verify';
import type { ResolvedCircle } from '../evaluate';
import type { Command, Id, Vec } from '../types';

const at = (x: number, y = 0): Vec => ({ x, y });
const circles = (entries: [Id, number][]) => new Map<Id, ResolvedCircle>(entries.map(([id, r]) => [id, { center: at(0), r }]));
const positions = new Map<Id, Vec>([['O', at(0)], ['A', at(3)]]);
const radiusViolations = (cmds: Command[], cs: Map<Id, ResolvedCircle>) => checkGivens(cmds, positions, cs).filter((v) => v.relation === 'radius');

describe('#2239 — verify: a stated radius must hold', () => {
  it('a sized circle drawn at another radius → one radius violation, worded with the circle, the value and the drawn one', () => {
    const v = radiusViolations([{ type: 'circle', id: 'circle-P', center: 'P', radius: 3 } as Command], circles([['circle-P', 1.5]]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ ids: ['circle-P'], messageKey: 'figure.v.radius', params: { circle: 'P', value: '3', drawn: '1.50' } });
  });

  it('a set-radius drawn at another radius → a violation; the LATEST statement of the size is the one judged', () => {
    const sized = { type: 'circle', id: 'circle-P', center: 'P', radius: 5, freeRadius: true } as Command;
    expect(radiusViolations([sized, { type: 'set-radius', circle: 'circle-P', value: 3 } as Command], circles([['circle-P', 2]]))).toHaveLength(1);
    expect(radiusViolations([sized, { type: 'set-radius', circle: 'circle-P', value: 3 } as Command], circles([['circle-P', 3]]))).toHaveLength(0);
  });

  it('a held stated radius → none', () => {
    expect(radiusViolations([{ type: 'circle', id: 'circle-P', center: 'P', radius: 3 } as Command], circles([['circle-P', 3]]))).toHaveLength(0);
  });

  it('a free radius (unstated) → none, whatever it is drawn', () => {
    expect(radiusViolations([{ type: 'circle', id: 'circle-P', center: 'P', radius: 5, freeRadius: true } as Command], circles([['circle-P', 1.2]]))).toHaveLength(0);
  });

  it('a through circle given a set-radius it drives (so it holds) → none', () => {
    const cmds = [
      { type: 'circle-through', id: 'circle-O', center: 'O', through: 'A' },
      { type: 'set-radius', circle: 'circle-O', value: 3 },
    ] as Command[];
    expect(radiusViolations(cmds, circles([['circle-O', 3]]))).toHaveLength(0);
  });
});
