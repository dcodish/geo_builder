/**
 * #2080 ([ADR-645](../../../docs/06-decisions.md#adr-645)) — `circlesStatedTangent` reads what the construction SAYS
 * (the `circles-tangent` statement's record), never where the circles are drawn; `circlesTouch` is the lengths twin.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../apply';
import { circlesStatedTangent } from '../structure';
import { circlesTouch } from '../evaluate';
import type { Command, Construction } from '../types';

const empty: Construction = { objects: [], constraints: [] };
const build = (cmds: Command[]) => cmds.reduce((c, cmd) => applyCommand(c, cmd), empty);
const free: Command[] = [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true },
  { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, apart: true },
] as Command[];
const sized: Command[] = [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 3 },
  { type: 'circle', id: 'circle-P', center: 'P', radius: 2, apart: true },
] as Command[];
const tan = (external: boolean) => ({ type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'M', external }) as Command;

describe('#2080 — circlesStatedTangent', () => {
  it.each([
    ['free radii, external', free, true],
    ['free radii, internal', free, false],
    ['stated radii, external', sized, true],
    ['stated radii, internal', sized, false],
  ] as const)('%s → true, in either argument order', (_n, base, external) => {
    const c = build([...base, tan(external)]);
    expect(circlesStatedTangent(c, 'circle-O', 'circle-P')).toBe(true);
    expect(circlesStatedTangent(c, 'circle-P', 'circle-O')).toBe(true);
  });

  it('equal stated radii, internal (the tangent-inner radius) → true', () => {
    const c = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 3 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3, apart: true },
      tan(false),
    ] as Command[]);
    expect(circlesStatedTangent(c, 'circle-O', 'circle-P')).toBe(true);
  });

  it('a crossing pair, and a pair that merely LOOKS tangent, → false', () => {
    const crossing = build([
      ...free,
      { type: 'circle-circle-intersection', id: 'X', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
    ] as Command[]);
    expect(circlesStatedTangent(crossing, 'circle-O', 'circle-P')).toBe(false);
    const looks = build([...sized, { type: 'set-distance', a: 'O', b: 'P', value: 5 }] as Command[]);
    expect(circlesStatedTangent(looks, 'circle-O', 'circle-P'), 'tangent by lengths is not STATED tangent').toBe(false);
  });
});

describe('#2083 — circlesTouch (the lengths member)', () => {
  const C = (x: number, r: number) => ({ center: { x, y: 0 }, r }) as never;
  it('external and internal touch within the stated-length ruler; a real crossing and a gap are not', () => {
    expect(circlesTouch(C(0, 3), C(5, 2))).toBe(true);
    expect(circlesTouch(C(0, 3), C(5.0005, 2))).toBe(true);
    expect(circlesTouch(C(0, 3), C(1, 2))).toBe(true);
    expect(circlesTouch(C(0, 3), C(4, 2))).toBe(false);
    expect(circlesTouch(C(0, 3), C(6, 2))).toBe(false);
    expect(circlesTouch(C(0, 3), C(5.01, 2))).toBe(false);
  });
});
