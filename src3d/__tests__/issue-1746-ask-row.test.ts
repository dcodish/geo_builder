/**
 * #1746 (ADR-3D-339) — the ask row names its subject ONCE.
 *
 * The ask row prints «<question> = <answer>» (App3's query section; the row format of #1547 / PR #1744).
 * An answer that carries its own subject prints it twice. Measured at 6096b643:
 *   «B»  after «B(1, t, 2)»          → «B = B(1, ?, 2)»                                  (the report)
 *   «S»  on a two-configuration point → «S = S(1.33, 7/2, 3.33) או (-4.33, 7/2, -2.33)»  (#1867's row)
 *   «k»  after «k = 2»                → «k = k = 2»                                      (the panel's params row)
 * Each is now the bare value, as every scalar kind already was.
 *
 * The CLASS is held by a sweep TOTAL over the query kinds (`Record<QueryKind3, …>`): a new kind cannot
 * compile without a case that asserts its JOINED row text. Every statement goes through `decideSubmit3`
 * (the real submit decision), every question through `answerQuery` (the real ask lane).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { answerQuery, type QueryKind3 } from '../engine/queries';
import { dataView } from '../engine/dataView';

type St = { facts: Fact3[]; seed: number };

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`«${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
const ask = (st: St, q: string) => answerQuery(derive3(st.facts, st.seed).construction, q, st.seed);
/** The row exactly as App3 prints its first line: the echo, « = », the answer. */
const row = (lines: readonly string[], q: string) => {
  const r = ask(build(lines), q);
  return r.answer === null ? `${r.text} — ${r.note}` : `${r.text} = ${r.answer}`;
};

const CUBE = ["קובייה ABCDA'B'C'D'"];
const CUBE_FRAMED = ["קובייה ABCDA'B'C'D'", 'A(0,0,0)', 'B(2,0,0)', 'D(0,2,0)', "A'(0,0,2)"];
const COORDS = ['A(0,0,0)', 'B(6,0,0)', 'C(0,6,0)', 'D(0,0,6)'];
/** #1499's play-sheet T7 (the #1506/#1867 figure): S has exactly two configurations. */
const T7 = [
  'ABC משולש', 'AB=u', 'AC=v', 'A(0,2,-1)', 'B(-3,2,2)', 'D על BC', 'D(-2,3,1)', 'AD=(2/3)u+(1/3)v',
  'ABEC מלבן', 'M מפגש אלכסונים במלבן ABEC', 'SM⊥ABC', '|SM| = 4',
];

describe('#1746 — the operator\'s report', () => {
  // #2077 (ADR-3D-368, ruling 2026-10-14 card d14-2077-point): the free axis reads the student's letter, so the
  // row is «B = (1, t, 2)»; what #1746 locks here — the label once — is unchanged.
  it('«B(1, t, 2)» then asking «B» reads «B = (1, t, 2)», the label once', () => {
    expect(row(['B(1, t, 2)'], 'B')).toBe('B = (1, t, 2)');
  });

  it('the same point asked in words', () => {
    expect(row(['B(1, t, 2)'], 'שיעורי B')).toBe('שיעורי B = (1, t, 2)');
    expect(row(['B(1, t, 2)'], 'coordinates of B')).toBe('coordinates of B = (1, t, 2)');
  });
});

describe('#1746 — the class: every query kind\'s JOINED row names its subject once', () => {
  /** One case per kind — `Record`, so the sweep is total over the kinds. */
  const CASES: Record<QueryKind3, readonly { lines: readonly string[]; q: string; want: string }[]> = {
    point: [
      { lines: ['B(1, t, 2)'], q: 'B', want: 'B = (1, t, 2)' },
      { lines: ['A(1,2,3)'], q: 'A', want: 'A = (1, 2, 3)' },
      // #1867's two-configuration point: the panel row's own text after the name
      { lines: T7, q: 'S', want: 'S = (1.33, 7/2, 3.33) או (-4.33, 7/2, -2.33)' },
    ],
    component: [{ lines: ['B(1, t, 2)'], q: 'x_B', want: 'x_B = 1' }],
    symbol: [
      // a pivot-lane symbol answers from the panel's params row — its VALUE, not the row
      { lines: ['פירמידה משולשת ABCD', 'AB = (k-1,k,3)', 'k = 2'], q: 'k', want: 'k = 2' },
      // the algebraic parameter's branch set (the #1591 / #1867 W1 rulings)
      { lines: ['הישר ℓ: x = (0,0,0) + t(m,1,1)', 'המישור π: mx - y - z + 3 = 0', 'הישר ℓ מקביל למישור π', 'המישור π2: z = 0', 'המישור π4: y = 0'], q: 'm', want: 'm = ±√2' },
    ],
    vector: [{ lines: ['A(0,0,0)', 'B(1,2,2)'], q: 'AB', want: 'AB = (1, 2, 2)' }],
    length: [{ lines: ['A(0,0,0)', 'B(1,2,2)'], q: '|AB|', want: '|AB| = 3' }],
    dot: [{ lines: CUBE, q: 'AB·AD', want: 'AB·AD = 0' }],
    'angle-vertex': [{ lines: CUBE, q: '∠ABC', want: '∠ABC = 90°' }],
    'angle-vec': [{ lines: CUBE, q: '∠(AB,AD)', want: '∠(AB,AD) = 90°' }],
    'line-plane': [{ lines: CUBE, q: "הזווית בין AC' למישור ABCD", want: "הזווית בין AC' למישור ABCD = 35.26°" }],
    'plane-plane': [{ lines: CUBE, q: "הזווית בין המישור ABC למישור A'BC", want: "הזווית בין המישור ABC למישור A'BC = 45°" }],
    'angle-ops': [{ lines: ['המישור π1: z = 3', 'המישור π2: x + y + z = 1'], q: '∠(π1,π2)', want: '∠(π1,π2) = 54.74°' }],
    distance: [{ lines: ['π1: z=3', 'π2: z=1'], q: 'המרחק בין π1 ל-π2', want: 'המרחק בין π1 ל-π2 = 2' }],
    area: [{ lines: COORDS, q: 'שטח ABC', want: 'שטח ABC = 18' }],
    volume: [{ lines: CUBE_FRAMED, q: "נפח ABCDA'B'C'D'", want: "נפח ABCDA'B'C'D' = 8" }],
    rev: [{ lines: ['חרוט שרדיוס בסיסו 5 וגובהו 12'], q: 'נפח החרוט', want: 'נפח החרוט = 100π' }],
    plane: [{ lines: ['A(0,0,0)', 'B(1,0,0)', 'C(0,1,0)'], q: 'מישור ABC', want: 'מישור ABC = z = 0' }],
  };

  for (const [kind, cases] of Object.entries(CASES)) {
    for (const { lines, q, want } of cases) {
      it(`${kind}: «${q}» reads «${want}»`, () => {
        expect(row(lines, q)).toBe(want);
      });
    }
  }
});

describe('#1746 — the panel keeps its own rows (one decision, two surfaces)', () => {
  it('the params row still prints «k = 2»; the ask answers its value', () => {
    const st = build(['פירמידה משולשת ABCD', 'AB = (k-1,k,3)', 'k = 2']);
    const p = dataView(derive3(st.facts, st.seed).construction, st.seed).params.find((r) => r.sym === 'k')!;
    expect(p).toMatchObject({ text: 'k = 2', value: '2', open: false });
    expect(ask(st, 'k').answer).toBe(p.value);
  });

  it('the points row still prints «B(1, t, 2)»; the ask answers the coordinates after the name', () => {
    const st = build(['B(1, t, 2)']);
    const panel = dataView(derive3(st.facts, st.seed).construction, st.seed);
    expect(panel.points).toContain('B(1, t, 2)');
    expect(ask(st, 'B').answer).toBe(panel.pointCoords.B.text);
  });

  it('an undetermined point is still refused, not answered with a bare «?»', () => {
    expect(row(CUBE, 'B')).toBe('B — undetermined');
  });
});
