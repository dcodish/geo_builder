/**
 * #2239 ([ADR-692](../../../docs/06-decisions.md#adr-692)) — stage 0a's `equalNestedPair` (`equalInternalTangency` before
 * #2206, [ADR-713](../../../docs/06-decisions.md#adr-713)): two circles of EQUAL radius by statement that a statement nests
 * (internally tangent, contained, concentric) are refused, in either order, through `applyStep`; nothing else is.
 */
import { describe, expect, it } from 'vitest';
import { applyStep } from '../step';
import { equalNestedPair } from '../radiusFeasibility';
import { evaluate } from '../evaluate';
import type { Command, Construction } from '../types';

const empty: Construction = { objects: [], constraints: [] };
/** fold commands through the real step, failing loudly on a refusal (the setup must build) */
const build = (cmds: Command[]): Construction =>
  cmds.reduce((c, cmd) => {
    const r = applyStep(c, cmd);
    if (!r.ok) throw new Error(`setup step refused: ${r.error}`);
    return r.construction;
  }, empty);
const circle = (id: string, center: string, radius: number, extra: object = {}) => ({ type: 'circle', id, center, radius, ...extra }) as Command;
const free = (id: string, center: string) => circle(id, center, 4, { freeRadius: true, apart: true });
const tan = (external: boolean) => ({ type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'M', external }) as Command;
const setRadius = (c: string, value: number) => ({ type: 'set-radius', circle: c, value }) as Command;

describe('#2239 — equalNestedPair, internal tangency', () => {
  it('(a) the tangency last, over two equal stated radii → refused, naming the radius', () => {
    const before = build([circle('circle-O', 'O', 3), circle('circle-P', 'P', 3, { apart: true })]);
    const r = applyStep(before, tan(false));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('over-constrained: equal circles circle-P nested int-tangent cannot hold');
    expect(!r.ok && r.ladder).toEqual(['pre:impossible']);
  });

  it('(b) a radius last, equal to the other circle of an internal tangency → refused, naming that circle', () => {
    const before = build([circle('circle-O', 'O', 3), free('circle-P', 'P'), tan(false)]);
    const r = applyStep(before, setRadius('circle-P', 3));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('over-constrained: equal circles circle-P nested int-tangent cannot hold');
    // the other order of the two radii: both free, O sized (holds), then P sized equal
    const both = build([free('circle-O', 'O'), free('circle-P', 'P'), tan(false), setRadius('circle-O', 3)]);
    expect(applyStep(both, setRadius('circle-P', 3)).ok).toBe(false);
  });

  it('external does not fire; the pair builds with both radii held', () => {
    const before = build([circle('circle-O', 'O', 3), circle('circle-P', 'P', 3, { apart: true })]);
    const r = applyStep(before, tan(true));
    expect(r.ok).toBe(true);
    const e = evaluate(r.construction);
    expect(e.ok && [e.circles.get('circle-O')!.r, e.circles.get('circle-P')!.r]).toEqual([3, 3]);
  });

  it('unequal radii do not fire, and the internal pair builds with both held', () => {
    const before = build([circle('circle-O', 'O', 3), circle('circle-P', 'P', 2, { apart: true })]);
    const r = applyStep(before, tan(false));
    expect(r.ok).toBe(true);
    const e = evaluate(r.construction);
    expect(e.ok && [e.circles.get('circle-O')!.r, e.circles.get('circle-P')!.r]).toEqual([3, 2]);
  });

  it('one radius free does not fire', () => {
    const before = build([circle('circle-O', 'O', 3), free('circle-P', 'P')]);
    expect(applyStep(before, tan(false)).ok).toBe(true);
  });

  it('3 vs 3 + 1e-7 is not "the same stated size" (#2119\'s 1e-9 relative tolerance)', () => {
    const before = build([circle('circle-O', 'O', 3), circle('circle-P', 'P', 3.0000001, { apart: true })]);
    const probed = { ...before }; // the predicate reads the radii only
    expect(equalNestedPair(before, probed, [tan(false)])).toBeNull();
  });

  it('a pair already equal and already stated internally tangent is not this step\'s contradiction', () => {
    // a construction carrying the record (as a loaded figure may) is judged once, by the step that completed it
    const before = build([circle('circle-O', 'O', 3), circle('circle-P', 'P', 3, { apart: true })]);
    const withRecord: Construction = { ...before, requirements: [{ kind: 'circle-position', relation: 'tangent', a: 'circle-O', b: 'circle-P', at: 'M', external: false }] };
    expect(equalNestedPair(withRecord, withRecord, [{ type: 'free-point', id: 'Z', x: 0, y: 0 } as Command])).toBeNull();
  });

  it('a radius-through-a-point circle keeps today\'s stage-0a message', () => {
    const before = build([
      { type: 'free-point', id: 'O', x: 0, y: 0 },
      { type: 'free-point', id: 'A', x: 3, y: 0 },
      { type: 'circle-through', id: 'circle-O', center: 'O', through: 'A' } as Command,
      circle('circle-P', 'P', 2, { apart: true }),
    ] as Command[]);
    const r = applyStep(before, tan(false));
    expect(!r.ok && r.error).toMatch(/^tangent circles need a fixed radius/);
  });
});

const contain = { type: 'set-circle-position', relation: 'contained', a: 'circle-O', b: 'circle-P' } as Command;
const ratio1 = { type: 'set-radius-ratio', c1: 'circle-O', c2: 'circle-P', k: 1 } as Command;

describe('#2206 — equalNestedPair, contained and concentric, and the equality as a ratio k = 1', () => {
  it('contained over two equal stated radii → refused; a radius completing it → refused', () => {
    const before = build([circle('circle-O', 'O', 3), circle('circle-P', 'P', 3, { apart: true })]);
    const r = applyStep(before, contain);
    expect(!r.ok && r.error).toBe('over-constrained: equal circles circle-P nested contained cannot hold');
    expect(!r.ok && r.ladder).toEqual(['pre:impossible']);
    const nested = build([free('circle-O', 'O'), free('circle-P', 'P'), contain, setRadius('circle-O', 3)]);
    expect(applyStep(nested, setRadius('circle-P', 3)).ok).toBe(false);
  });

  it('a ratio k = 1 on a nested pair fires, either order; k = 2 does not', () => {
    const tangentFirst = build([free('circle-O', 'O'), free('circle-P', 'P'), tan(false)]);
    expect(applyStep(tangentFirst, ratio1).ok).toBe(false);
    const ratioFirst = build([free('circle-O', 'O'), free('circle-P', 'P'), ratio1]);
    const r = applyStep(ratioFirst, contain);
    expect(!r.ok && r.error).toBe('over-constrained: equal circles circle-P nested contained cannot hold');
    expect(applyStep(tangentFirst, { ...ratio1, k: 2 } as Command).ok).toBe(true);
  });

  it('two circles on one centre with equal stated radii → refused; unequal does not fire', () => {
    const one = build([circle('circle-O', 'O', 3)]);
    const r = applyStep(one, circle('circle-O-2', 'O', 3));
    expect(!r.ok && r.error).toBe('over-constrained: equal circles circle-O-2 nested concentric cannot hold');
    expect(applyStep(one, circle('circle-O-2', 'O', 2)).ok).toBe(true);
  });

  it('unequal, one free, or apart: no fire', () => {
    expect(applyStep(build([circle('circle-O', 'O', 5), circle('circle-P', 'P', 3, { apart: true })]), contain).ok).toBe(true);
    expect(applyStep(build([circle('circle-O', 'O', 3), free('circle-P', 'P')]), contain).ok).toBe(true);
    const apart = build([circle('circle-O', 'O', 3), circle('circle-P', 'P', 3, { apart: true })]);
    expect(equalNestedPair(apart, apart, [{ type: 'set-circle-position', relation: 'disjoint', a: 'circle-O', b: 'circle-P' } as Command])).toBeNull();
  });
});
