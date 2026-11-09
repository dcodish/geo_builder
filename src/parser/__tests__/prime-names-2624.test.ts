/**
 * #2624 ([ADR-806](../../../docs/06-decisions.md#adr-806), [ADR-807](../../../docs/06-decisions.md#adr-807)) — a primed
 * point name is a name: «A'» is the point A′, distinct from A, and is never read as A. Unit level: the parser's reading
 * (`parse` against a hand-built context), the label atoms and the label accountant. The figures are locked once, in the
 * scenario corpus (`primed-point-on-circle-2624`, `primed-names-triangle-2624`) and the parity rows `prime-*-2624`.
 *
 * Measured at pickup (4a06aae9) through `decideDeterministic2D`, the model mocked: «מעגל O» · «A' על המעגל» committed
 * `point-on-circle A` (the prime dropped, a point A drawn green); «משולש ABC» · «A' אמצע BC» was refused as if it named A;
 * «נקודה A'», «משולש A'B'C'» and «A' על BC» went to the AI. 2-D's label atom had no prime, and no honesty gate
 * tokenized one.
 *
 * Operator rulings: #2435 (2026-10-23) *"what analytic reads, 2-D reads too"*; #2621 (2026-10-30) *"now we need to build
 * all capabilities"*; and the honesty invariant: a given parses to a constraint, escalates, or errors, but never vanishes.
 */
import { describe, expect, it } from 'vitest';
import { parse, normalizeUtterance, type ParseContext } from '../parse';
import { unaccountedLabels } from '../labelAccounting';
import { LABEL_G, LABEL_WHOLE, labelsOf } from '../lexicon';
import type { AnyCommand } from '@/engine';

const CIRCLE: ParseContext = { points: ['O'], circles: ['O'], circleMembers: [{ id: 'circle-O', center: 'O', points: [] }] };
const TRIANGLE: ParseContext = { points: ['A', 'B', 'C'], polygons: [['A', 'B', 'C']] };
const TRIANGLE_MID: ParseContext = { points: ['A', 'B', 'C', "A'"], polygons: [['A', 'B', 'C']] };

const read = (u: string, ctx: ParseContext = {}): AnyCommand[] => {
  const r = parse(u, ctx);
  expect(r.ok, `«${u}» parses: ${JSON.stringify(r).slice(0, 200)}`).toBe(true);
  return r.ok ? r.commands : [];
};

describe('#2624 — the grammar reads a primed name as one name', () => {
  it.each([
    ["A' על המעגל", CIRCLE, { type: 'point-on-circle', id: "A'" }], // the reported line
    ["A' אמצע BC", TRIANGLE, { type: 'midpoint', id: "A'", a: 'B', b: 'C' }], // refused as A before
    ["נקודה A'", {}, { type: 'free-point', id: "A'" }],
    ["משולש A'B'C'", {}, { type: 'triangle', ids: ["A'", "B'", "C'"] }],
    ["A' על BC", TRIANGLE, { type: 'point-on-segment', id: "A'", a: 'B', b: 'C' }],
    ["A'B = 3", TRIANGLE_MID, { type: 'set-distance', a: "A'", b: 'B', value: 3 }],
    ["AA' = 8", TRIANGLE_MID, { type: 'set-distance', a: 'A', b: "A'", value: 8 }],
  ] as const)('«%s» → %j', (u, ctx, cmd) => {
    const cmds = read(u, ctx);
    expect(cmds).toContainEqual(expect.objectContaining(cmd));
    // never the unprimed letter in its place
    if ('id' in cmd) expect(cmds.some((c) => (c as { id?: string }).id === cmd.id.replace("'", ''))).toBe(false);
  });
  it.each(['′', '’', '׳', 'ʹ', '´'])("the prime glyph «%s» folds at the boundary: the same name A'", (g) => {
    expect(normalizeUtterance(`A${g} על המעגל`)).toBe("A' על המעגל");
    expect(read(`A${g} על המעגל`, CIRCLE)).toContainEqual(expect.objectContaining({ type: 'point-on-circle', id: "A'" }));
  });
  it("English «ABC's» is a possessive (control): the atom does not take the prime", () => {
    expect(labelsOf(normalizeUtterance("triangle ABC's area"))).toEqual(['A', 'B', 'C']);
  });
  it('the lexicon atoms: LABEL_G splits a primed run, LABEL_WHOLE takes one primed name', () => {
    expect("AA'B'".match(LABEL_G)).toEqual(['A', "A'", "B'"]);
    expect(labelsOf("seg-A'B")).toEqual(["A'", 'B']);
    expect(LABEL_WHOLE.test("A'")).toBe(true);
    expect(LABEL_WHOLE.test("A'B")).toBe(false);
  });
});

describe('#2624 — the prime net: a reading that carries A for a typed A\' is never committed (any rule, swept or not)', () => {
  it("«A' על המעגל» lowered to point-on-circle A leaves A' unaccounted", () => {
    const s = normalizeUtterance("A' על המעגל");
    const ctx = { existingPoints: ['O', 'A'], circleMembers: [{ id: 'circle-O', center: 'O', points: [] }] };
    expect(unaccountedLabels(s, [{ type: 'point-on-circle', id: 'A', circle: 'circle-O' } as AnyCommand], ctx).labels).toEqual(["A'"]);
  });
  it("«A' אמצע BC» lowered to midpoint A leaves A' unaccounted, though A is on the figure", () => {
    const s = normalizeUtterance("A' אמצע BC");
    expect(unaccountedLabels(s, [{ type: 'midpoint', id: 'A', a: 'B', b: 'C' } as AnyCommand], { existingPoints: ['A', 'B', 'C'] }).labels).toEqual(["A'"]);
  });
  it("the right reading accounts it: the id A' and the segment `seg-A'B` carry A'", () => {
    const s = normalizeUtterance("A'B = 3");
    expect(unaccountedLabels(s, [{ type: 'set-distance', a: "A'", b: 'B', value: 3 } as AnyCommand]).labels).toEqual([]);
    expect(unaccountedLabels(s, [{ type: 'segment', id: "seg-A'B" } as unknown as AnyCommand]).labels).toEqual([]);
  });
});
