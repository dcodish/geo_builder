/**
 * #2239 ([ADR-692](../../../docs/06-decisions.md#adr-692)) — stage 0a's `equalInternalTangency`: two circles of EQUAL
 * stated radius stated internally tangent are refused, in either order, through `applyStep`; nothing else is.
 */
import { describe, expect, it } from 'vitest';
import { applyStep } from '../step';
import { equalInternalTangency } from '../radiusFeasibility';
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

describe('#2239 — equalInternalTangency', () => {
  it('(a) the tangency last, over two equal stated radii → refused, naming the radius', () => {
    const before = build([circle('circle-O', 'O', 3), circle('circle-P', 'P', 3, { apart: true })]);
    const r = applyStep(before, tan(false));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('over-constrained: radius of circle-P = 3 cannot hold');
    expect(!r.ok && r.ladder).toEqual(['pre:impossible']);
  });

  it('(b) a radius last, equal to the other circle of an internal tangency → refused, naming that circle', () => {
    const before = build([circle('circle-O', 'O', 3), free('circle-P', 'P'), tan(false)]);
    const r = applyStep(before, setRadius('circle-P', 3));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('over-constrained: radius of circle-P = 3 cannot hold');
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
    expect(equalInternalTangency(before, probed, [tan(false)])).toBeNull();
  });

  it('a pair already equal and already stated internally tangent is not this step\'s contradiction', () => {
    // a construction carrying the record (as a loaded figure may) is judged once, by the step that completed it
    const before = build([circle('circle-O', 'O', 3), circle('circle-P', 'P', 3, { apart: true })]);
    const withRecord: Construction = { ...before, requirements: [{ kind: 'circle-position', relation: 'tangent', a: 'circle-O', b: 'circle-P', at: 'M', external: false }] };
    expect(equalInternalTangency(withRecord, withRecord, [{ type: 'free-point', id: 'Z', x: 0, y: 0 } as Command])).toBeNull();
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
