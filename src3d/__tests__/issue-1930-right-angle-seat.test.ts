/**
 * #1930 (ADR-3D-354, amends ADR-3D-042) — AN UNSTATED RIGHT ANGLE MOVES TO THE VERTEX A LATER RIGHT ANGLE
 * NAMES, HOWEVER IT IS WRITTEN.
 *
 * «משולש ישר זווית ABC» seats its unstated right angle at B as a SOFT default, which `derive3`'s pre-scan
 * drops when the student states a right angle on the same three vertices. The pre-scan knew only the
 * spellings whose arms both START at the vertex («AB ⊥ AC», «∠ACB = 90°»), so «AC ⊥ BC» (arms A→C, B→C)
 * and the one-letter «∠C = 90°» left the default standing beside the stated angle, and the line was refused
 * `givens-contradict`. One reader (`statedRightAngle3`) now reads the stated vertex off every spelling.
 *
 * A right angle the student STATED never moves: two stated right angles stay refused.
 * Every submit goes through `decideSubmit3`, the real submit decision.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, statedRightAngle3, type Fact3 } from '../store/store3';
import { vertexAngleDeg } from '../engine/claims';
import type { Command3 } from '../engine/types';

type St = { facts: Fact3[]; seed: number };

const R = 'משולש ישר זווית ABC';

function run(lines: readonly string[]): { st: St; verdicts: string[] } {
  let st: St = { facts: [], seed: 0 };
  const verdicts: string[] = [];
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    verdicts.push(v.kind === 'refused' ? v.error.code : v.kind);
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return { st, verdicts };
}

/** The angle at each vertex of ABC, at the figure's seed and the next five (the configuration walk). */
function anglesAt(st: St, v: 'A' | 'B' | 'C'): number[] {
  const [p, q] = (['A', 'B', 'C'] as const).filter((x) => x !== v);
  return [0, 1, 2, 3, 4, 5].map((s) => {
    const deg = vertexAngleDeg(derive3(st.facts, st.seed + s).positions, v, p, q);
    if (deg === null) throw new Error(`no angle at ${v} at seed ${st.seed + s}`); // a degenerate corner is a failure
    return deg;
  });
}

function expectRightAt(lines: readonly string[], v: 'A' | 'B' | 'C') {
  const { st, verdicts } = run(lines);
  expect(verdicts, lines.join(' · ')).toEqual(lines.map(() => 'record'));
  for (const deg of anglesAt(st, v)) expect(deg).toBeCloseTo(90, 4);
  for (const other of (['A', 'B', 'C'] as const).filter((x) => x !== v))
    for (const deg of anglesAt(st, other)) expect(Math.abs(deg - 90)).toBeGreaterThan(1);
}

describe('#1930 — the reported sequence', () => {
  it('«משולש ישר זווית ABC» · «AC ⊥ BC» records, with the right angle at C at every configuration', () => {
    expectRightAt([R, 'AC ⊥ BC'], 'C');
  });
});

describe('#1930 — every spelling moves the right angle to the vertex it names', () => {
  const atC = ['AC ⊥ BC', 'BC ⊥ AC', 'AC מאונך ל-BC', '∠C = 90°', '∠C = 90', 'זווית C ישרה', 'הזווית C ישרה', 'CA ⊥ CB', '∠ACB = 90°', '∠BCA = 90°'];
  const atA = ['BA ⊥ CA', 'AB ⊥ CA', '∠A = 90°', 'זווית A ישרה', 'AB ⊥ AC', '∠CAB = 90°'];
  const atB = ['AB ⊥ BC', '∠ABC = 90°'];
  for (const l of atC) it(`«${l}» → C`, () => expectRightAt([R, l], 'C'));
  for (const l of atA) it(`«${l}» → A`, () => expectRightAt([R, l], 'A'));
  for (const l of atB) it(`«${l}» → B (the default, unchanged)`, () => expectRightAt([R, l], 'B'));

  it('the other nouns of a right triangle', () => {
    expectRightAt(['משולש ABC ישר זווית', 'AC ⊥ BC'], 'C');
    expectRightAt(['right triangle ABC', 'AC ⊥ BC'], 'C');
  });

  it('with a length stated before or after', () => {
    expectRightAt([R, 'AB = 3', 'AC ⊥ BC'], 'C');
    expectRightAt([R, 'AC ⊥ BC', 'AB = 5'], 'C');
  });
});

describe('#1930 — a STATED right angle never moves (controls)', () => {
  it('a second stated right angle stays refused', () => {
    expect(run([R, 'AB ⊥ BC', 'AC ⊥ BC']).verdicts).toEqual(['record', 'record', 'givens-contradict']);
    expect(run([R, '∠ACB = 90°', 'AB ⊥ BC']).verdicts).toEqual(['record', 'record', 'givens-contradict']);
    expect(run([R, 'AC ⊥ BC', 'AB ⊥ BC']).verdicts).toEqual(['record', 'record', 'givens-contradict']);
  });
  it('legs longer than the hypotenuse stay refused', () => {
    expect(run([R, 'AB = 3', 'BC = 5', 'AC ⊥ BC']).verdicts.at(-1)).toBe('givens-contradict');
  });
});

describe('#1930 — #1888’s taught lines keep building at the named vertex', () => {
  for (const first of ['משולש ABC', R]) {
    it(`after «${first}»`, () => {
      expectRightAt([first, '∠ABC = 90°'], 'B');
      expectRightAt([first, '∠CAB = 90°'], 'A');
      expectRightAt([first, '∠BCA = 90°'], 'C');
    });
  }
});

describe('#1930 — the other soft defaults are unchanged', () => {
  it('an isosceles triangle’s soft equal pair still retires to any stated equal pair', () => {
    for (const l of ['|CA| = |CB|', '|AC| = |BC|', '|BA| = |BC|', '|AB| = |CB|'])
      expect(run(['משולש שווה שוקיים ABC', l]).verdicts, l).toEqual(['record', 'record']);
  });
  it('a right trapezoid still records a right angle stated at its corners', () => {
    for (const l of ['AB ⊥ AD', '∠DAB = 90°', 'זווית A ישרה', 'AB ⊥ BC', '∠ABC = 90°'])
      expect(run(['טרפז ישר זווית ABCD', l]).verdicts, l).toEqual(['record', 'record']);
  });
});

describe('#1930 — statedRightAngle3, the one reader (vertex first)', () => {
  const pair = (from: string, to: string) => ({ kind: 'pair' as const, from, to });
  const cos = (u: [string, string], v: [string, string], extra: object = {}): Command3 =>
    ({ type: 'cos-angle', u: pair(...u), v: pair(...v), cos: 0, ...extra }) as Command3;
  const soft = [['B', 'A', 'C']];
  it('reads the vertex both arms share, at whichever end it sits', () => {
    expect(statedRightAngle3(cos(['A', 'C'], ['B', 'C']), soft)?.[0]).toBe('C');
    expect(statedRightAngle3(cos(['C', 'A'], ['C', 'B']), soft)?.[0]).toBe('C');
    expect(statedRightAngle3(cos(['B', 'A'], ['C', 'A']), soft)?.[0]).toBe('A');
    expect(statedRightAngle3(cos(['A', 'B'], ['B', 'C']), soft)?.[0]).toBe('B');
  });
  it('a soft angle, a non-right cosine and four labels are not a stated right angle', () => {
    expect(statedRightAngle3(cos(['B', 'A'], ['B', 'C'], { soft: true }), soft)).toBeNull();
    expect(statedRightAngle3({ ...(cos(['A', 'C'], ['B', 'C']) as object), cos: 0.5 } as Command3, soft)).toBeNull();
    expect(statedRightAngle3(cos(['A', 'B'], ['C', 'D']), soft)).toBeNull();
  });
  it('a one-letter angle names the ONE soft triangle with that corner, or nothing', () => {
    const at = (vertex: string, tris: string[][]) => statedRightAngle3({ type: 'vertex-angle', vertex, deg: 90 } as Command3, tris);
    expect(new Set(at('C', soft))).toEqual(new Set(['C', 'A', 'B']));
    expect(at('C', soft)?.[0]).toBe('C');
    expect(at('D', soft)).toBeNull();
    expect(at('C', [...soft, ['C', 'D', 'E']])).toBeNull();
    expect(statedRightAngle3({ type: 'vertex-angle', vertex: 'C', deg: 60 } as Command3, soft)).toBeNull();
  });
});
