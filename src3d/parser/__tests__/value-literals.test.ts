/**
 * #510 — a coordinate component takes the same VALUE literals as a stated magnitude.
 *
 * The inconsistency, from one prod session: «|BD'| = √48» parses and the operator uses √ routinely,
 * while «C(√2,1,0)» refused. The tool OFFERS √ and ½ on its own symbol palette and accepted them in one
 * slot but not another — the offered-but-unsupported asymmetry #493 was filed on.
 *
 * The mechanism is a PAIR: the `VAL` lexical atom and `literalValue`, its reader (which delegates to
 * `parseCoeff`, the existing reader for this family — a second evaluator would be a second set of
 * malformed-input rules to keep in step). The filed plan was to widen the shared `NUM` atom itself;
 * measurement says that would have been a silent NaN generator, because ~47 rules compose from `NUM`
 * and read their captures with `+`/`parseFloat`, so a widened atom without a widened reader puts `NaN`
 * INSIDE a committed figure. Migrating those rules onto `VAL` one at a time is filed follow-up work.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parse3';

const first = (u: string) => {
  const r = parse3(u);
  return r.ok ? (r.commands[0] as Record<string, unknown>) : null;
};

describe('#510 — the literal family a coordinate now accepts', () => {
  it.each([
    ['C(√2,1,0)', Math.SQRT2],
    ['C(2√3,1,0)', 2 * Math.sqrt(3)],
    ['C(√6/4,1,0)', Math.sqrt(6) / 4],
    ['C(1/2,1,0)', 0.5],
    ['C(½,1,0)', 0.5],
    ['C(¾,1,0)', 0.75],
    ['C(-√2,1,0)', -Math.SQRT2],
    ['C(1.5,1,0)', 1.5],
    ['C(3,1,0)', 3],
  ])('«%s» reads x = %s', (u, x) => {
    expect(first(u)).toMatchObject({ type: 'point3', id: 'C', y: 1, z: 0 });
    expect(first(u)!.x).toBeCloseTo(x as number, 12);
  });

  it('the SAME literals reach a vector and a pair injection — one atom, one reader', () => {
    expect(first('v = (√2,-5,0)')!.x).toBeCloseTo(Math.SQRT2, 12);
    expect(first('BD = (√2,5,12)')!.x).toBeCloseTo(Math.SQRT2, 12);
    // …and an injection LIST, which already composed from the shared component atom
    expect(first('נתונות הנקודות: A(√2,1,0), B(2,3,4)')!.x).toBeCloseTo(Math.SQRT2, 12);
  });
});

describe('#510 — what must not change', () => {
  it.each([
    ['A(1,2,3)', { type: 'point3', id: 'A', x: 1, y: 2, z: 3 }],
    ['BD = (-4,5,12)', { type: 'inject-pair', a: 'B', b: 'D', x: -4, y: 5, z: 12 }],
    ['v = (10,-5,0)', { type: 'inject-vector', name: 'v', x: 10, y: -5, z: 0 }],
    ["A'B' = (1,2,3)", { type: 'inject-pair', a: "A'", b: "B'" }],
  ])('«%s» is byte-identical', (u, shape) => expect(first(u)).toMatchObject(shape));

  it('the SYMBOLIC branch is untouched — that boundary is #509\'s, and needs a ruling', () => {
    expect(first('C(2t,t,k)')).toMatchObject({ type: 'point3', syms: ['t', 't', 'k'] });
    expect(first('C(p,p+4,0)')).toMatchObject({ type: 'point3', z: 0 });
    expect(parse3('C(p^2,p^2+4,0)').ok).toBe(false); // still refused, deliberately
  });

  it('a MALFORMED literal declines — it is never an "unknown" coordinate', () => {
    // «1/0» matches the atom lexically and evaluates to nothing. Before the VALUE atom that could not
    // happen, so the rules read a null component as SYMBOLIC — left ungated, the student would state a
    // value and the figure would claim not to know it. All-or-nothing instead.
    expect(parse3('C(1/0,1,0)').ok).toBe(false);
    expect(parse3('נתונות הנקודות: A(1/0,1,0)').ok).toBe(false);
  });
});
